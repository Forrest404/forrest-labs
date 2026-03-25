import os
import uuid
import tempfile
import logging
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from deface.centerface import CenterFace
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 52 * 1024 * 1024  # 52 MB

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialise CenterFace once at module level to avoid reloading the ONNX
# model on every request — the model is CPU-bound and expensive to load.
centerface = CenterFace()

ALLOWED_IMAGE_TYPES = {
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp'
}
ALLOWED_VIDEO_TYPES = {
    'video/mp4', 'video/quicktime', 'video/webm'
}
ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def validate_file(file_bytes: bytes, claimed_type: str) -> bool:
    """
    Validate file by inspecting magic bytes, not just the claimed Content-Type.
    Returns True if the file signature matches a supported type.
    """
    if len(file_bytes) < 12:
        return False

    header = file_bytes[:12]

    # JPEG: FF D8 FF
    if header[:3] == b'\xff\xd8\xff':
        return True

    # PNG: 89 50 4E 47 (‰PNG)
    if header[:4] == b'\x89PNG':
        return True

    # WebP: RIFF....WEBP
    if header[:4] == b'RIFF' and file_bytes[8:12] == b'WEBP':
        return True

    # MP4 / MOV: bytes 4-8 contain 'ftyp'
    if file_bytes[4:8] == b'ftyp':
        return True

    # Some MP4s start with a null box — check offset 0 too
    if header[:4] == b'\x00\x00\x00\x00' and len(file_bytes) > 8 and file_bytes[4:8] == b'ftyp':
        return True

    return False


def strip_exif(image_bytes: bytes) -> bytes:
    """
    Reconstruct image from raw pixel data only, discarding all metadata
    (EXIF, XMP, IPTC, GPS, camera info).
    """
    img = Image.open(BytesIO(image_bytes))

    if img.mode == 'P':
        img = img.convert('RGBA')
    elif img.mode in ('RGBA', 'RGB', 'L'):
        pass
    else:
        img = img.convert('RGB')

    clean = Image.new(img.mode, img.size)
    clean.putdata(list(img.getdata()))

    out = BytesIO()
    clean.save(out, format='JPEG', quality=92)
    return out.getvalue()


def blur_faces(image_array: np.ndarray) -> tuple[np.ndarray, int]:
    """
    Detect all faces in image_array and apply proportional Gaussian blur.
    Returns (blurred_array, number_of_faces_found).
    """
    h, w = image_array.shape[:2]
    dets, _ = centerface(image_array, h, w, threshold=0.2)

    faces_found = len(dets)

    for det in dets:
        x1, y1, x2, y2 = map(int, det[:4])

        # Expand bounding box by 30% (15% each side) to catch hair/ears
        fw = x2 - x1
        fh = y2 - y1
        x1 = max(0, x1 - int(fw * 0.15))
        y1 = max(0, y1 - int(fh * 0.15))
        x2 = min(w, x2 + int(fw * 0.15))
        y2 = min(h, y2 + int(fh * 0.15))

        # Kernel size proportional to face area; minimum 51, always odd
        area = (x2 - x1) * (y2 - y1)
        kernel = max(int(area / 150), 51)
        if kernel % 2 == 0:
            kernel += 1

        region = image_array[y1:y2, x1:x2]
        blurred = cv2.GaussianBlur(region, (kernel, kernel), 0)
        image_array[y1:y2, x1:x2] = blurred

    return image_array, faces_found


def verify_no_faces(image_array: np.ndarray) -> bool:
    """
    Run a second CenterFace pass at a lower threshold to confirm no faces
    remain after blurring.
    Returns True if clean, False if faces are still detectable.
    """
    h, w = image_array.shape[:2]
    dets, _ = centerface(image_array, h, w, threshold=0.35)
    return len(dets) == 0


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------

def process_image(file_bytes: bytes, report_id: str) -> dict:
    # 1. Strip EXIF
    clean_bytes = strip_exif(file_bytes)

    # 2. Decode to numpy array
    nparr = np.frombuffer(clean_bytes, np.uint8)
    img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_array is None:
        raise ValueError("Could not decode image")

    # 3. First blur pass
    blurred_array, faces_found = blur_faces(img_array)

    # 4. Verification pass — re-blur more aggressively if faces remain
    if not verify_no_faces(blurred_array):
        logger.warning("Faces still detected after first pass, re-blurring (report_id=%s)", report_id)
        h, w = blurred_array.shape[:2]
        dets, _ = centerface(blurred_array, h, w, threshold=0.15)
        for det in dets:
            x1, y1, x2, y2 = map(int, det[:4])
            fw = x2 - x1
            fh = y2 - y1
            x1 = max(0, x1 - int(fw * 0.15))
            y1 = max(0, y1 - int(fh * 0.15))
            x2 = min(w, x2 + int(fw * 0.15))
            y2 = min(h, y2 + int(fh * 0.15))
            area = (x2 - x1) * (y2 - y1)
            kernel = max(int(area / 100), 71)
            if kernel % 2 == 0:
                kernel += 1
            region = blurred_array[y1:y2, x1:x2]
            blurred_array[y1:y2, x1:x2] = cv2.GaussianBlur(region, (kernel, kernel), 0)

    # 5. Encode back to JPEG
    _, buffer = cv2.imencode('.jpg', blurred_array, [cv2.IMWRITE_JPEG_QUALITY, 92])
    output_bytes = buffer.tobytes()

    # 6. Upload to Supabase Storage
    filename = f"approved/{report_id}_{uuid.uuid4()}.jpg"
    supabase.storage.from_('media').upload(
        filename,
        output_bytes,
        file_options={"content-type": "image/jpeg"},
    )
    public_url: str = supabase.storage.from_('media').get_public_url(filename)

    # 7. Update report row
    supabase.table('reports').update({
        'media_url': public_url,
        'media_status': 'approved',
    }).eq('id', report_id).execute()

    return {
        'success': True,
        'url': public_url,
        'faces_detected': faces_found,
        'filename': filename,
    }


def process_video(file_bytes: bytes, report_id: str) -> dict:
    tmp_input_path = None
    tmp_output_path = None

    try:
        # 1. Write input to temp file (VideoCapture requires a path)
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_input_path = tmp.name

        # 2. Open with VideoCapture
        cap = cv2.VideoCapture(tmp_input_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # 3. Create temp output file
        tmp_out = tempfile.NamedTemporaryFile(suffix='_out.mp4', delete=False)
        tmp_output_path = tmp_out.name
        tmp_out.close()

        # 4. Create VideoWriter — audio is intentionally stripped for privacy;
        #    audio tracks can contain ambient speech that identifies reporters.
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(tmp_output_path, fourcc, fps, (width, height))

        # 5. Process each frame
        total_faces = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            blurred_frame, faces = blur_faces(frame)
            total_faces += faces
            out.write(blurred_frame)

        # 6. Release resources
        cap.release()
        out.release()

        # 7. Read output and upload
        with open(tmp_output_path, 'rb') as f:
            video_bytes = f.read()

        filename = f"approved/{report_id}_{uuid.uuid4()}.mp4"
        supabase.storage.from_('media').upload(
            filename,
            video_bytes,
            file_options={"content-type": "video/mp4"},
        )
        public_url: str = supabase.storage.from_('media').get_public_url(filename)

        # 8. Update report row
        supabase.table('reports').update({
            'media_url': public_url,
            'media_status': 'approved',
        }).eq('id', report_id).execute()

        return {
            'success': True,
            'url': public_url,
            'faces_detected': total_faces,
            'filename': filename,
        }

    finally:
        # 9. Always clean up temp files
        if tmp_input_path:
            Path(tmp_input_path).unlink(missing_ok=True)
        if tmp_output_path:
            Path(tmp_output_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'forrest-labs-worker'})


@app.route('/process-media', methods=['POST'])
def process_media():
    # 1. Check required fields
    if 'file' not in request.files:
        return jsonify({'error': 'Missing file field'}), 400
    if 'report_id' not in request.form:
        return jsonify({'error': 'Missing report_id field'}), 400

    upload = request.files['file']

    # 2. Read and size-check
    file_bytes = upload.read()
    if len(file_bytes) > 50 * 1024 * 1024:
        return jsonify({'error': 'File too large. Max 50MB.'}), 413
    if len(file_bytes) == 0:
        return jsonify({'error': 'Empty file'}), 400

    # 3. MIME + magic byte validation
    content_type = upload.content_type or ''
    if content_type not in ALLOWED_TYPES:
        return jsonify({'error': f'Unsupported file type: {content_type}'}), 415
    if not validate_file(file_bytes, content_type):
        return jsonify({'error': 'File content does not match declared type'}), 415

    # 4. Validate report_id looks like a UUID
    report_id = request.form.get('report_id', '')
    if len(report_id) != 36 or report_id.count('-') != 4:
        return jsonify({'error': 'Invalid report_id format'}), 400

    # 5. Mark as processing immediately
    supabase.table('reports').update({
        'media_status': 'processing',
    }).eq('id', report_id).execute()

    # 6. Dispatch to image or video processor
    try:
        if content_type in ALLOWED_IMAGE_TYPES:
            result = process_image(file_bytes, report_id)
        else:
            result = process_video(file_bytes, report_id)
        return jsonify(result), 200

    except Exception as e:
        logger.error("Processing failed for report_id=%s: %s", report_id, str(e))
        supabase.table('reports').update({
            'media_status': 'rejected',
        }).eq('id', report_id).execute()
        return jsonify({'success': False, 'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Max 50MB.'}), 413


@app.errorhandler(415)
def unsupported(e):
    return jsonify({'error': 'Unsupported file type.'}), 415


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)
