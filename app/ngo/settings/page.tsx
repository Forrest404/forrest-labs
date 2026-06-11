'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useConfirm, SkeletonRows } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: {
    loading: 'Loading…', retry: 'Retry', e_load: 'Could not load settings.', e_save: 'Could not save.', e_save_net: 'Could not save. Please try again.', saving: 'Saving…', cancel: 'Cancel',
    title: 'Settings', sub_admin: 'Manage your account, organisation, safety and data.', sub_leader: 'Manage your account and safety configuration.', sub_basic: 'Manage your account.', back_field: '← Back to field',
    tab_account: 'My account', tab_safety: 'Safety', tab_data: 'Data & privacy', tab_org: 'Organisation', tab_people: 'People & roles', tab_notif: 'Notifications', tab_integrations: 'Integrations',
    sec_profile: 'Profile', full_name: 'Full name', email: 'Email', email_hint: 'Contact your org admin to change your email.', phone: 'Phone', language: 'Language', system_default: 'System default',
    sec_avail: 'Availability', off_duty: 'Off duty', off_duty_note: 'When off duty you receive no notifications at all — not even panic or roll-call — and you won’t be flagged for missed check-ins. Your own panic button still alerts your team.',
    sec_notif_me: 'Notifications to me', notif_me_note: 'Panic, roll-call and missed-check-in alerts always reach you — these preferences apply only to non-urgent notices.', push_notif: 'Push notifications', quiet_from: 'Quiet hours from', quiet_to: 'to', quiet_note: 'Quiet hours mute non-urgent notifications only (evaluated in UTC). Leave blank for none.', which_events: 'Which non-urgent events reach me, and how:',
    sec_push: 'Push notifications (ntfy)', push_intro: 'NOUR sends alerts through the free ntfy app. Install it and subscribe to your organisation’s channel once — then panic, roll-call, dispatch and broadcast alerts reach your phone.', save_account: 'Save account',
    sec_security: 'Security', twofa_label: 'Two-factor authentication:', on: 'on', off: 'off', manage_2fa: 'Manage 2FA →', logout_all: 'Log out of all devices', logout_all_note: 'Signs you out everywhere, including this device — useful for a lost or shared phone. (Individual devices can’t be listed — sessions are anonymous.)',
    sec_privacy: 'Privacy & data', privacy_summary: 'How NOUR handles your data (summary) →', privacy_policy: 'Privacy Policy (full legal version) →', account_saved: 'Account saved.',
    safety_intro: 'These directly affect whether the safety system catches someone in trouble.', checkin_window: 'Check-in window (minutes)', checkin_hint: 'Field staff are escalated if they miss this proof-of-life window.', escal_window: 'Panic escalation window (minutes)', escal_hint: 'If no responder acknowledges a panic within this time, it re-alerts up the chain (and again at 2×).', show_ack: 'Show field staff when a panic is acknowledged', show_ack_note: 'Silent-mode alerts always suppress this, regardless of the setting.', save_safety: 'Save safety settings', safety_saved: 'Safety settings saved.',
    sec_retention: 'Location retention', keep_for: 'Keep location data for (hours)', keep_hint: 'Check-ins, GPS, resolved panics and roll-calls older than this are permanently deleted automatically. Lower = a breach or seized device exposes less. Active panics are never auto-deleted.', save_retention: 'Save retention', retention_saved: 'Retention saved.', purge_now: 'Purge old location data now', purge_note: 'Permanent and immediate. Asks for confirmation.', purge_confirm_t: 'Permanently delete old location data?', purge_confirm_b: 'Deletes this organisation’s location data older than the retention window now. This cannot be undone. Active panic alerts are kept.', del: 'Delete', purge_fail: 'Purge failed.', purged_prefix: 'Purged:', check_ins: 'check-ins', resolved_panics: 'resolved panics', roll_calls: 'roll calls', positions_cleared: 'stale team positions cleared.',
    sec_sharing: 'Data sharing (off by default)', sharing_intro: 'Aid-worker location is sensitive. When on, NOUR shares only team type and a rough area with other orgs — never names, never precise pins. (Not active yet.)', share_presence: 'Share team presence with other orgs', share_area: 'Share operational area with other orgs', save_sharing: 'Save sharing', sharing_saved: 'Sharing settings saved.', how_handles: 'How NOUR handles your data →',
    org_name: 'Organisation name', org_type: 'Type', country: 'Country', save_org: 'Save organisation', org_saved: 'Organisation saved.', op_area: 'Operational area:', defined: 'defined', not_set: 'not set', edit_map: 'Edit on map →',
    danger: 'Danger zone', wipe_title: 'Wipe teams & members', wipe_desc: 'Removes all teams, roster members, and every team-leader / field-coordinator account. Your organisation, its admins, and incident / dispatch history are kept. This cannot be undone.', wipe_btn: 'Wipe teams & members…', type_to_confirm_a: 'Type', type_to_confirm_b: 'to confirm', wiping: 'Wiping…', wipe_everyone: 'Wipe everyone', wiped_prefix: 'Wiped:', teams_word: 'team(s) and', members_removed: 'member account(s) removed.', e_wipe: 'Could not wipe teams & members.',
    delete_org_title: 'Delete this organisation', delete_org_desc_a: 'Closes', delete_org_desc_b: 'and signs everyone out immediately. Data is retained and can be restored by the NOUR platform team.', civ_unaffected: 'Civilian reports are unaffected.', delete_org_btn: 'Delete this organisation…', closing: 'Closing…', close_org: 'Close organisation', e_close: 'Could not close the organisation.',
    ot_ingo: 'International NGO', ot_lngo: 'Local NGO', ot_un_agency: 'UN agency', ot_crescent_cross: 'Red Cross / Red Crescent', ot_community: 'Community group', ot_other: 'Other',
    people_intro: 'People management lives on its own pages — this keeps one home for each thing.', users_title: 'Users & roles', users_desc: 'Invite members, assign/change roles, suspend or remove accounts, sign out devices.', teams_title: 'Teams & roster', teams_desc_admin: 'Create teams and manage members.', teams_desc_leader: 'View and manage your teams’ rosters.',
    notif_intro: 'Default routing for non-urgent events org-wide. Each person’s own preferences (My account) override these. Changes save as you toggle.', event_defaults: 'Event defaults', notif_warn: 'Safety-critical alerts — panic, roll call, missed check-in, and dispatch — are always delivered to the responder chain by push. They can’t be turned off here or by personal preferences.',
    ext_chat_title: 'External chat groups', ext_chat_desc: 'Manage links to your Signal / WhatsApp / Telegram groups.', providers: 'Delivery providers', prov_push: 'Push (in-app / ntfy)', prov_email: 'Email', prov_email_note: 'Not configured — invites/resets won’t send.', delivery_log: 'Delivery log', log_intro: 'Recent notification sends — so a failed alert is visible. No message contents are stored.', failed_a: 'urgent alert(s) failed to send. Check your push provider.', no_sends: 'No sends logged yet.', api_planned: 'API access for large agencies: planned — not available yet.', configured: 'configured', not_configured: 'not configured', logout_done: 'Could not sign out.',
    cur_pin: 'Current PIN', cur_pw: 'Current password', new_pin: 'New 6-digit PIN', new_pw: 'New password (min 8)', change_pin: 'Change PIN', change_pw: 'Change password', pin_changed: 'PIN changed.', pw_changed: 'Password changed.', e_cred: 'Could not change credential.',
    ev_new_incident: 'New incident in area', ev_broadcast: 'Broadcast', ev_report_ready: 'Report ready', m_enabled: 'enabled', m_push: 'push', m_email: 'email', e_prefs: 'Could not load preferences.',
    ps_step1: '1. Install the free ntfy app:', ps_iphone: 'iPhone (App Store)', ps_android_play: 'Android (Play Store)', ps_android_fdroid: 'Android (F-Droid)', ps_web: 'Web app', ps_step2: '2. Subscribe to your organisation’s alert channel:', ps_open_browser: 'Open in browser', ps_open_app: 'Open in ntfy app', ps_gen_qr: 'Generating QR…', ps_scan_note: 'Scan the QR from another phone, or type the channel name into the app.', ps_li1: 'Open the ntfy app and tap “+” / “Subscribe to topic”.', ps_li2: 'Scan the QR above, or type the channel name exactly.', ps_li3: 'Leave the server as the default (ntfy.sh). Tap Subscribe.', ps_li4: 'Allow notifications when the app asks.', ps_li5: 'Tap “Send test notification” below to confirm it works.', ps_send_test: 'Send test notification', ps_sending: 'Sending…', ps_not_ready: 'Your push channel isn’t ready yet — try again shortly.', ps_e_load: 'Could not load your push channel.', ps_test_429: 'Too many tests — wait a minute and try again.', ps_test_stub: 'Sent — but no live push relay is configured, so nothing will arrive yet.', ps_test_ok: 'Test sent. Check the ntfy app on your phone.', ps_test_fail: 'Could not send the test. Try again shortly.', ps_test_fail2: 'Could not send the test.',
  },
  fr: {
    loading: 'Chargement…', retry: 'Réessayer', e_load: 'Impossible de charger les paramètres.', e_save: 'Impossible d’enregistrer.', e_save_net: 'Impossible d’enregistrer. Réessayez.', saving: 'Enregistrement…', cancel: 'Annuler',
    title: 'Paramètres', sub_admin: 'Gérez votre compte, votre organisation, la sécurité et les données.', sub_leader: 'Gérez votre compte et la configuration de sécurité.', sub_basic: 'Gérez votre compte.', back_field: '← Retour au terrain',
    tab_account: 'Mon compte', tab_safety: 'Sécurité', tab_data: 'Données & confidentialité', tab_org: 'Organisation', tab_people: 'Personnes & rôles', tab_notif: 'Notifications', tab_integrations: 'Intégrations',
    sec_profile: 'Profil', full_name: 'Nom complet', email: 'E-mail', email_hint: 'Contactez votre administrateur pour changer d’e-mail.', phone: 'Téléphone', language: 'Langue', system_default: 'Par défaut du système',
    sec_avail: 'Disponibilité', off_duty: 'Hors service', off_duty_note: 'Hors service, vous ne recevez aucune notification — ni panique ni appel — et vous n’êtes pas signalé pour les pointages manqués. Votre bouton panique alerte toujours votre équipe.',
    sec_notif_me: 'Notifications pour moi', notif_me_note: 'Les alertes panique, appel et pointage manqué vous parviennent toujours — ces préférences ne concernent que les avis non urgents.', push_notif: 'Notifications push', quiet_from: 'Heures calmes de', quiet_to: 'à', quiet_note: 'Les heures calmes ne coupent que les notifications non urgentes (en UTC). Laissez vide pour aucune.', which_events: 'Quels événements non urgents me parviennent, et comment :',
    sec_push: 'Notifications push (ntfy)', push_intro: 'NOUR envoie les alertes via l’app gratuite ntfy. Installez-la et abonnez-vous une fois au canal de votre organisation — panique, appel, déploiement et diffusions arrivent sur votre téléphone.', save_account: 'Enregistrer le compte',
    sec_security: 'Sécurité', twofa_label: 'Authentification à deux facteurs :', on: 'activée', off: 'désactivée', manage_2fa: 'Gérer la 2FA →', logout_all: 'Déconnecter tous les appareils', logout_all_note: 'Vous déconnecte partout, y compris cet appareil — utile pour un téléphone perdu ou partagé. (Les appareils ne peuvent être listés — sessions anonymes.)',
    sec_privacy: 'Confidentialité & données', privacy_summary: 'Comment NOUR gère vos données (résumé) →', privacy_policy: 'Politique de confidentialité (version légale) →', account_saved: 'Compte enregistré.',
    safety_intro: 'Cela détermine si le système de sécurité repère quelqu’un en danger.', checkin_window: 'Fenêtre de pointage (minutes)', checkin_hint: 'Le personnel est escaladé s’il manque cette fenêtre de preuve de vie.', escal_window: 'Fenêtre d’escalade de panique (minutes)', escal_hint: 'Si aucun répondant n’accuse réception d’une panique dans ce délai, elle ré-alerte la chaîne (puis à 2×).', show_ack: 'Montrer au personnel quand une panique est confirmée', show_ack_note: 'Le mode silencieux supprime toujours cela, quel que soit le réglage.', save_safety: 'Enregistrer la sécurité', safety_saved: 'Paramètres de sécurité enregistrés.',
    sec_retention: 'Conservation des positions', keep_for: 'Conserver les positions (heures)', keep_hint: 'Pointages, GPS, paniques résolues et appels plus anciens sont supprimés automatiquement. Plus bas = une fuite ou un appareil saisi expose moins. Les paniques actives ne sont jamais auto-supprimées.', save_retention: 'Enregistrer la conservation', retention_saved: 'Conservation enregistrée.', purge_now: 'Purger les anciennes positions maintenant', purge_note: 'Permanent et immédiat. Demande confirmation.', purge_confirm_t: 'Supprimer définitivement les anciennes positions ?', purge_confirm_b: 'Supprime maintenant les positions plus anciennes que la fenêtre de conservation. Irréversible. Les paniques actives sont conservées.', del: 'Supprimer', purge_fail: 'Échec de la purge.', purged_prefix: 'Purgé :', check_ins: 'pointages', resolved_panics: 'paniques résolues', roll_calls: 'appels', positions_cleared: 'positions d’équipe obsolètes effacées.',
    sec_sharing: 'Partage de données (désactivé par défaut)', sharing_intro: 'La position des humanitaires est sensible. Activé, NOUR ne partage que le type d’équipe et une zone approximative — jamais de noms ni de positions précises. (Pas encore actif.)', share_presence: 'Partager la présence des équipes', share_area: 'Partager la zone opérationnelle', save_sharing: 'Enregistrer le partage', sharing_saved: 'Paramètres de partage enregistrés.', how_handles: 'Comment NOUR gère vos données →',
    org_name: 'Nom de l’organisation', org_type: 'Type', country: 'Pays', save_org: 'Enregistrer l’organisation', org_saved: 'Organisation enregistrée.', op_area: 'Zone opérationnelle :', defined: 'définie', not_set: 'non définie', edit_map: 'Modifier sur la carte →',
    danger: 'Zone de danger', wipe_title: 'Effacer équipes & membres', wipe_desc: 'Supprime toutes les équipes, membres et chaque compte chef d’équipe / coordinateur. Votre organisation, ses administrateurs et l’historique incidents / déploiements sont conservés. Irréversible.', wipe_btn: 'Effacer équipes & membres…', type_to_confirm_a: 'Tapez', type_to_confirm_b: 'pour confirmer', wiping: 'Effacement…', wipe_everyone: 'Tout effacer', wiped_prefix: 'Effacé :', teams_word: 'équipe(s) et', members_removed: 'compte(s) membre supprimés.', e_wipe: 'Impossible d’effacer équipes & membres.',
    delete_org_title: 'Supprimer cette organisation', delete_org_desc_a: 'Ferme', delete_org_desc_b: 'et déconnecte tout le monde immédiatement. Les données sont conservées et restaurables par l’équipe plateforme NOUR.', civ_unaffected: 'Les signalements civils ne sont pas affectés.', delete_org_btn: 'Supprimer cette organisation…', closing: 'Fermeture…', close_org: 'Fermer l’organisation', e_close: 'Impossible de fermer l’organisation.',
    ot_ingo: 'ONG internationale', ot_lngo: 'ONG locale', ot_un_agency: 'Agence de l’ONU', ot_crescent_cross: 'Croix-Rouge / Croissant-Rouge', ot_community: 'Groupe communautaire', ot_other: 'Autre',
    people_intro: 'La gestion des personnes a ses propres pages — une maison pour chaque chose.', users_title: 'Utilisateurs & rôles', users_desc: 'Inviter des membres, attribuer/changer les rôles, suspendre ou supprimer des comptes, déconnecter les appareils.', teams_title: 'Équipes & effectifs', teams_desc_admin: 'Créer des équipes et gérer les membres.', teams_desc_leader: 'Voir et gérer les effectifs de vos équipes.',
    notif_intro: 'Routage par défaut des événements non urgents pour toute l’org. Les préférences de chacun (Mon compte) priment. Les changements sont enregistrés à chaque bascule.', event_defaults: 'Défauts d’événements', notif_warn: 'Les alertes critiques — panique, appel, pointage manqué et déploiement — sont toujours envoyées à la chaîne de réponse par push. Elles ne peuvent être désactivées.',
    ext_chat_title: 'Groupes de discussion externes', ext_chat_desc: 'Gérez les liens vers vos groupes Signal / WhatsApp / Telegram.', providers: 'Fournisseurs de distribution', prov_push: 'Push (in-app / ntfy)', prov_email: 'E-mail', prov_email_note: 'Non configuré — invitations/réinitialisations non envoyées.', delivery_log: 'Journal de distribution', log_intro: 'Envois récents — pour voir une alerte échouée. Aucun contenu n’est stocké.', failed_a: 'alerte(s) urgente(s) non envoyée(s). Vérifiez votre fournisseur push.', no_sends: 'Aucun envoi enregistré.', api_planned: 'Accès API pour grandes agences : prévu — pas encore disponible.', configured: 'configuré', not_configured: 'non configuré', logout_done: 'Impossible de se déconnecter.',
    cur_pin: 'PIN actuel', cur_pw: 'Mot de passe actuel', new_pin: 'Nouveau PIN à 6 chiffres', new_pw: 'Nouveau mot de passe (8 min)', change_pin: 'Changer le PIN', change_pw: 'Changer le mot de passe', pin_changed: 'PIN modifié.', pw_changed: 'Mot de passe modifié.', e_cred: 'Impossible de changer l’identifiant.',
    ev_new_incident: 'Nouvel incident dans la zone', ev_broadcast: 'Diffusion', ev_report_ready: 'Rapport prêt', m_enabled: 'activé', m_push: 'push', m_email: 'e-mail', e_prefs: 'Impossible de charger les préférences.',
    ps_step1: '1. Installez l’app gratuite ntfy :', ps_iphone: 'iPhone (App Store)', ps_android_play: 'Android (Play Store)', ps_android_fdroid: 'Android (F-Droid)', ps_web: 'App web', ps_step2: '2. Abonnez-vous au canal d’alerte de votre organisation :', ps_open_browser: 'Ouvrir dans le navigateur', ps_open_app: 'Ouvrir dans ntfy', ps_gen_qr: 'Génération du QR…', ps_scan_note: 'Scannez le QR depuis un autre téléphone, ou tapez le nom du canal dans l’app.', ps_li1: 'Ouvrez ntfy et touchez « + » / « S’abonner à un sujet ».', ps_li2: 'Scannez le QR ci-dessus, ou tapez le nom exact du canal.', ps_li3: 'Laissez le serveur par défaut (ntfy.sh). Touchez S’abonner.', ps_li4: 'Autorisez les notifications quand l’app le demande.', ps_li5: 'Touchez « Envoyer une notification test » ci-dessous pour vérifier.', ps_send_test: 'Envoyer une notification test', ps_sending: 'Envoi…', ps_not_ready: 'Votre canal push n’est pas prêt — réessayez bientôt.', ps_e_load: 'Impossible de charger votre canal push.', ps_test_429: 'Trop de tests — attendez une minute et réessayez.', ps_test_stub: 'Envoyé — mais aucun relais push n’est configuré, rien n’arrivera pour l’instant.', ps_test_ok: 'Test envoyé. Vérifiez l’app ntfy sur votre téléphone.', ps_test_fail: 'Échec de l’envoi du test. Réessayez bientôt.', ps_test_fail2: 'Échec de l’envoi du test.',
  },
  ar: {
    loading: 'جارٍ التحميل…', retry: 'إعادة المحاولة', e_load: 'تعذّر تحميل الإعدادات.', e_save: 'تعذّر الحفظ.', e_save_net: 'تعذّر الحفظ. حاول مرة أخرى.', saving: 'جارٍ الحفظ…', cancel: 'إلغاء',
    title: 'الإعدادات', sub_admin: 'أدِر حسابك ومنظمتك والسلامة والبيانات.', sub_leader: 'أدِر حسابك وإعدادات السلامة.', sub_basic: 'أدِر حسابك.', back_field: '← العودة إلى الميدان',
    tab_account: 'حسابي', tab_safety: 'السلامة', tab_data: 'البيانات والخصوصية', tab_org: 'المنظمة', tab_people: 'الأشخاص والأدوار', tab_notif: 'الإشعارات', tab_integrations: 'التكاملات',
    sec_profile: 'الملف الشخصي', full_name: 'الاسم الكامل', email: 'البريد الإلكتروني', email_hint: 'تواصل مع مسؤول منظمتك لتغيير بريدك.', phone: 'الهاتف', language: 'اللغة', system_default: 'افتراضي النظام',
    sec_avail: 'التوفّر', off_duty: 'خارج الخدمة', off_duty_note: 'خارج الخدمة لا تصلك أي إشعارات — ولا حتى الاستغاثة أو النداء — ولا تُحتسب ضمن التسجيلات الفائتة. زر الاستغاثة ما زال ينبّه فريقك.',
    sec_notif_me: 'الإشعارات إليّ', notif_me_note: 'تنبيهات الاستغاثة والنداء والتسجيل الفائت تصلك دائماً — هذه التفضيلات للإشعارات غير العاجلة فقط.', push_notif: 'الإشعارات الفورية', quiet_from: 'ساعات الهدوء من', quiet_to: 'إلى', quiet_note: 'تكتم ساعات الهدوء الإشعارات غير العاجلة فقط (بتوقيت UTC). اتركها فارغة لإيقافها.', which_events: 'أي الأحداث غير العاجلة تصلني، وكيف:',
    sec_push: 'الإشعارات الفورية (ntfy)', push_intro: 'ترسل نور التنبيهات عبر تطبيق ntfy المجاني. ثبّته واشترك في قناة منظمتك مرة واحدة — فتصلك الاستغاثة والنداء والإيفاد والبثّ على هاتفك.', save_account: 'حفظ الحساب',
    sec_security: 'الأمان', twofa_label: 'المصادقة الثنائية:', on: 'مفعّلة', off: 'معطّلة', manage_2fa: 'إدارة المصادقة الثنائية →', logout_all: 'تسجيل الخروج من كل الأجهزة', logout_all_note: 'يسجّل خروجك من كل مكان بما فيه هذا الجهاز — مفيد لهاتف مفقود أو مشترك. (لا يمكن سرد الأجهزة — الجلسات مجهولة.)',
    sec_privacy: 'الخصوصية والبيانات', privacy_summary: 'كيف تتعامل نور مع بياناتك (ملخّص) →', privacy_policy: 'سياسة الخصوصية (النسخة القانونية) →', account_saved: 'تم حفظ الحساب.',
    safety_intro: 'تؤثر هذه مباشرة على قدرة نظام السلامة على رصد من هو في خطر.', checkin_window: 'نافذة التسجيل (دقائق)', checkin_hint: 'يُصعَّد الميدانيون إذا فاتتهم نافذة إثبات الحياة هذه.', escal_window: 'نافذة تصعيد الاستغاثة (دقائق)', escal_hint: 'إذا لم يؤكّد مستجيب الاستغاثة خلال هذا الوقت، تُعاد إلى أعلى السلسلة (ثم عند الضعف).', show_ack: 'إظهار للميدانيين عند تأكيد الاستغاثة', show_ack_note: 'الوضع الصامت يكتم هذا دائماً بغضّ النظر عن الإعداد.', save_safety: 'حفظ إعدادات السلامة', safety_saved: 'تم حفظ إعدادات السلامة.',
    sec_retention: 'الاحتفاظ بالمواقع', keep_for: 'الاحتفاظ بالمواقع (ساعات)', keep_hint: 'تُحذف التسجيلات و GPS والاستغاثات المُنهاة والنداءات الأقدم من ذلك تلقائياً. أقل = تسرّب أو جهاز مُصادَر يكشف أقل. الاستغاثات النشطة لا تُحذف تلقائياً.', save_retention: 'حفظ الاحتفاظ', retention_saved: 'تم حفظ الاحتفاظ.', purge_now: 'مسح المواقع القديمة الآن', purge_note: 'دائم وفوري. يطلب تأكيداً.', purge_confirm_t: 'حذف المواقع القديمة نهائياً؟', purge_confirm_b: 'يحذف الآن مواقع المنظمة الأقدم من نافذة الاحتفاظ. لا يمكن التراجع. تبقى الاستغاثات النشطة.', del: 'حذف', purge_fail: 'فشل المسح.', purged_prefix: 'تم المسح:', check_ins: 'تسجيلات', resolved_panics: 'استغاثات مُنهاة', roll_calls: 'نداءات', positions_cleared: 'مواقع فِرق قديمة مُسحت.',
    sec_sharing: 'مشاركة البيانات (معطّلة افتراضياً)', sharing_intro: 'موقع العامل الإنساني حسّاس. عند التفعيل تشارك نور نوع الفريق ومنطقة تقريبية فقط — بلا أسماء ولا مواقع دقيقة. (غير مفعّل بعد.)', share_presence: 'مشاركة وجود الفِرق مع منظمات أخرى', share_area: 'مشاركة منطقة العمليات مع منظمات أخرى', save_sharing: 'حفظ المشاركة', sharing_saved: 'تم حفظ إعدادات المشاركة.', how_handles: 'كيف تتعامل نور مع بياناتك →',
    org_name: 'اسم المنظمة', org_type: 'النوع', country: 'البلد', save_org: 'حفظ المنظمة', org_saved: 'تم حفظ المنظمة.', op_area: 'منطقة العمليات:', defined: 'محددة', not_set: 'غير محددة', edit_map: 'تعديل على الخريطة →',
    danger: 'منطقة الخطر', wipe_title: 'مسح الفِرق والأعضاء', wipe_desc: 'يزيل كل الفِرق والأعضاء وكل حسابات قادة الفرق والمنسّقين الميدانيين. تبقى منظمتك ومسؤولوها وسجلّ الحوادث/الإيفاد. لا يمكن التراجع.', wipe_btn: 'مسح الفِرق والأعضاء…', type_to_confirm_a: 'اكتب', type_to_confirm_b: 'للتأكيد', wiping: 'جارٍ المسح…', wipe_everyone: 'مسح الجميع', wiped_prefix: 'تم المسح:', teams_word: 'فريق و', members_removed: 'حساب عضو أُزيلت.', e_wipe: 'تعذّر مسح الفِرق والأعضاء.',
    delete_org_title: 'حذف هذه المنظمة', delete_org_desc_a: 'يُغلق', delete_org_desc_b: 'ويسجّل خروج الجميع فوراً. تُحفظ البيانات ويمكن لفريق منصة نور استعادتها.', civ_unaffected: 'لا تتأثّر بلاغات المدنيين.', delete_org_btn: 'حذف هذه المنظمة…', closing: 'جارٍ الإغلاق…', close_org: 'إغلاق المنظمة', e_close: 'تعذّر إغلاق المنظمة.',
    ot_ingo: 'منظمة دولية', ot_lngo: 'منظمة محلية', ot_un_agency: 'وكالة أممية', ot_crescent_cross: 'الصليب الأحمر / الهلال الأحمر', ot_community: 'مجموعة مجتمعية', ot_other: 'أخرى',
    people_intro: 'إدارة الأشخاص لها صفحاتها الخاصة — مكان واحد لكل شيء.', users_title: 'المستخدمون والأدوار', users_desc: 'دعوة الأعضاء وتعيين/تغيير الأدوار وتعليق أو إزالة الحسابات وتسجيل خروج الأجهزة.', teams_title: 'الفِرق والأعضاء', teams_desc_admin: 'إنشاء الفِرق وإدارة الأعضاء.', teams_desc_leader: 'عرض وإدارة أعضاء فِرقك.',
    notif_intro: 'التوجيه الافتراضي للأحداث غير العاجلة لكامل المنظمة. تفضيلات كل شخص (حسابي) تتجاوز هذه. تُحفظ التغييرات عند التبديل.', event_defaults: 'افتراضيات الأحداث', notif_warn: 'التنبيهات الحرجة — الاستغاثة والنداء والتسجيل الفائت والإيفاد — تصل دائماً لسلسلة الاستجابة عبر الإشعار. لا يمكن إيقافها.',
    ext_chat_title: 'مجموعات الدردشة الخارجية', ext_chat_desc: 'أدِر روابط مجموعات Signal / WhatsApp / Telegram.', providers: 'مزوّدو التوصيل', prov_push: 'إشعار (داخل التطبيق / ntfy)', prov_email: 'البريد', prov_email_note: 'غير مُعدّ — لن تُرسَل الدعوات/إعادة التعيين.', delivery_log: 'سجلّ التوصيل', log_intro: 'عمليات الإرسال الأخيرة — لرؤية أي تنبيه فاشل. لا تُخزَّن محتويات الرسائل.', failed_a: 'تنبيه عاجل فشل إرساله. تحقق من مزوّد الإشعار.', no_sends: 'لا عمليات إرسال مسجّلة بعد.', api_planned: 'وصول API للوكالات الكبيرة: مخطّط — غير متاح بعد.', configured: 'مُعدّ', not_configured: 'غير مُعدّ', logout_done: 'تعذّر تسجيل الخروج.',
    cur_pin: 'الرمز الحالي', cur_pw: 'كلمة المرور الحالية', new_pin: 'رمز جديد من 6 أرقام', new_pw: 'كلمة مرور جديدة (8 على الأقل)', change_pin: 'تغيير الرمز', change_pw: 'تغيير كلمة المرور', pin_changed: 'تم تغيير الرمز.', pw_changed: 'تم تغيير كلمة المرور.', e_cred: 'تعذّر تغيير بيانات الدخول.',
    ev_new_incident: 'حادثة جديدة في المنطقة', ev_broadcast: 'بثّ', ev_report_ready: 'التقرير جاهز', m_enabled: 'مفعّل', m_push: 'إشعار', m_email: 'بريد', e_prefs: 'تعذّر تحميل التفضيلات.',
    ps_step1: '١. ثبّت تطبيق ntfy المجاني:', ps_iphone: 'آيفون (App Store)', ps_android_play: 'أندرويد (Play Store)', ps_android_fdroid: 'أندرويد (F-Droid)', ps_web: 'تطبيق الويب', ps_step2: '٢. اشترك في قناة تنبيهات منظمتك:', ps_open_browser: 'فتح في المتصفح', ps_open_app: 'فتح في ntfy', ps_gen_qr: 'جارٍ إنشاء QR…', ps_scan_note: 'امسح QR من هاتف آخر، أو اكتب اسم القناة في التطبيق.', ps_li1: 'افتح ntfy واضغط «+» / «الاشتراك في موضوع».', ps_li2: 'امسح QR أعلاه، أو اكتب اسم القناة بالضبط.', ps_li3: 'اترك الخادم الافتراضي (ntfy.sh). اضغط اشتراك.', ps_li4: 'اسمح بالإشعارات عندما يطلب التطبيق.', ps_li5: 'اضغط «إرسال إشعار تجريبي» أدناه للتأكد.', ps_send_test: 'إرسال إشعار تجريبي', ps_sending: 'جارٍ الإرسال…', ps_not_ready: 'قناة الإشعار غير جاهزة بعد — حاول قريباً.', ps_e_load: 'تعذّر تحميل قناة الإشعار.', ps_test_429: 'اختبارات كثيرة — انتظر دقيقة وحاول.', ps_test_stub: 'أُرسل — لكن لا يوجد مُرحِّل إشعار مُعدّ، لن يصل شيء بعد.', ps_test_ok: 'أُرسل الاختبار. تحقق من تطبيق ntfy على هاتفك.', ps_test_fail: 'تعذّر إرسال الاختبار. حاول قريباً.', ps_test_fail2: 'تعذّر إرسال الاختبار.',
  },
} as const

const ORG_TYPES = [
  { value: 'ingo', label: 'International NGO' },
  { value: 'lngo', label: 'Local NGO' },
  { value: 'un_agency', label: 'UN agency' },
  { value: 'crescent_cross', label: 'Red Cross / Red Crescent' },
  { value: 'community', label: 'Community group' },
  { value: 'other', label: 'Other' },
]
const LANGS = [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية (Arabic)' }, { value: 'fr', label: 'Français' }]

type Role = 'org_admin' | 'team_leader' | 'field_coordinator'

interface Org {
  name: string; type: string; country: string | null; status: string
  checkin_window_minutes: number; share_team_presence: boolean; share_operational_area: boolean
  has_operational_area: boolean
  panic_ack_visible_default: boolean; panic_escalation_minutes: number
  location_retention_hours: number
  alert_new_incident: boolean; alert_missed_checkin: boolean; alert_panic: boolean; alert_low_ack: boolean
}
interface Account {
  full_name: string; email: string; phone: string | null; role: Role
  language: string | null; notif_push: boolean; notif_sms: boolean
  quiet_start: number | null; quiet_end: number | null; off_duty: boolean
  has_password: boolean; has_pin: boolean; totp_enabled: boolean
}
interface Providers { push: boolean; sms: boolean; email: boolean }

type TabId = 'account' | 'safety' | 'data' | 'org' | 'people' | 'notif' | 'integrations'
const TABS: { id: TabId; label: string; roles: Role[] }[] = [
  { id: 'account', label: 'My account', roles: ['org_admin', 'team_leader', 'field_coordinator'] },
  { id: 'safety', label: 'Safety', roles: ['org_admin', 'team_leader'] },
  { id: 'data', label: 'Data & privacy', roles: ['org_admin'] },
  { id: 'org', label: 'Organisation', roles: ['org_admin'] },
  { id: 'people', label: 'People & roles', roles: ['org_admin', 'team_leader'] },
  { id: 'notif', label: 'Notifications', roles: ['org_admin'] },
  { id: 'integrations', label: 'Integrations', roles: ['org_admin'] },
]

function minToTime(m: number | null): string { if (m == null) return ''; const h = Math.floor(m / 60); const mm = m % 60; return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
function timeToMin(s: string): number | null { if (!s) return null; const [h, m] = s.split(':').map(Number); if (isNaN(h) || isNaN(m)) return null; return h * 60 + m }

export default function NgoSettingsPage() {
  const confirm = useConfirm()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [role, setRole] = useState<Role | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [providers, setProviders] = useState<Providers | null>(null)
  const [tab, setTab] = useState<TabId>('account')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<{ entries: any[]; failed_critical: number; available: boolean } | null>(null)
  const [dangerArm, setDangerArm] = useState<null | 'wipe' | 'close'>(null) // which danger action is armed
  const [confirmText, setConfirmText] = useState('') // must match the org name to enable the action

  const isAdmin = role === 'org_admin'

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const cr = await fetch('/api/ngo/auth/check', { cache: 'no-store' })
      const r: Role | null = cr.ok ? (await cr.json()).role ?? null : null
      setRole(r)
      const me = await fetch('/api/ngo/me', { cache: 'no-store' })
      if (me.ok) setAccount((await me.json()).account)
      // Org settings only matter for managers; field coords skip it.
      if (r === 'org_admin' || r === 'team_leader') {
        const or = await fetch('/api/ngo/org', { cache: 'no-store' })
        if (or.ok) { const d = await or.json(); setOrg(d.org); setProviders(d.providers ?? null) }
      }
    } catch { setError(t('e_load')) }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load() }, [load])

  const setO = <K extends keyof Org>(k: K, v: Org[K]) => setOrg((o) => (o ? { ...o, [k]: v } : o))
  const setA = <K extends keyof Account>(k: K, v: Account[K]) => setAccount((a) => (a ? { ...a, [k]: v } : a))

  // Load the delivery log when the Integrations tab opens (org_admin).
  useEffect(() => {
    if (tab !== 'integrations' || !isAdmin) return
    fetch('/api/ngo/notify/log', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setLog(d)).catch(() => {})
  }, [tab, isAdmin])

  const visibleTabs = TABS.filter((tb) => role && tb.roles.includes(role))
  // Keep the active tab valid for the role.
  useEffect(() => { if (role && !visibleTabs.some((tb) => tb.id === tab)) setTab('account') }, [role]) // eslint-disable-line

  async function patchOrg(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/org', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setMsg(okMsg); else setError(d.error ?? t('e_save'))
    } catch { setError(t('e_save_net')) }
    finally { setBusy(false) }
  }

  async function saveAccount() {
    if (!account) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: account.full_name, phone: account.phone, language: account.language, notif_push: account.notif_push, quiet_start: account.quiet_start, quiet_end: account.quiet_end, off_duty: account.off_duty }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setMsg(t('account_saved')); try { if (account.language) localStorage.setItem('fl_lang', account.language) } catch {} }
      else setError(d.error ?? t('e_save'))
    } catch { setError(t('e_save_net')) }
    finally { setBusy(false) }
  }

  async function purgeNow() {
    if (!(await confirm({ title: t('purge_confirm_t'), body: t('purge_confirm_b'), danger: true, confirmLabel: t('del') }))) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/org/purge', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setMsg(`${t('purged_prefix')} ${d.check_ins_deleted} ${t('check_ins')}, ${d.panics_deleted} ${t('resolved_panics')}, ${d.roll_calls_deleted} ${t('roll_calls')}, ${d.team_positions_cleared} ${t('positions_cleared')}`)
      else setError(d.error ?? t('purge_fail'))
    } catch { setError(t('purge_fail')) }
    finally { setBusy(false) }
  }

  // Danger zone — both require typing the exact org name (confirmText) to enable.
  async function wipeOrg() {
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/org/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_name: confirmText }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setMsg(`${t('wiped_prefix')} ${d.teams_deleted} ${t('teams_word')} ${d.users_deleted} ${t('members_removed')}`); setDangerArm(null); setConfirmText('') }
      else setError(d.error ?? t('e_wipe'))
    } catch { setError(t('e_wipe')) }
    finally { setBusy(false) }
  }
  async function closeOrg() {
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/org', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_name: confirmText }) })
      if (res.ok) {
        // Org is closed → end this session and bounce to login (every other session is revoked
        // server-side on its next request).
        await fetch('/api/ngo/auth/logout', { method: 'POST' }).catch(() => {})
        window.location.href = '/ngo/login'
        return
      }
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? t('e_close'))
    } catch { setError(t('e_close')) }
    finally { setBusy(false) }
  }

  async function logoutEverywhere() {
    if (!(await confirm({ title: t('logout_all') + '?', body: t('logout_all_note'), danger: true, confirmLabel: t('logout_all') }))) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/ngo/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout_all' }) })
      if (res.ok) { window.location.replace('/ngo/login') }
      else { const d = await res.json().catch(() => ({})); setError(d.error ?? t('logout_done')) }
    } catch { setError(t('logout_done')) }
    finally { setBusy(false) }
  }

  return (
    <div className="ngo-page" style={wrap} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Field coordinators reach Settings via the field-screen "Account" link and have no
          sidebar — give them an obvious one-tap way back to their field page. */}
      {role === 'field_coordinator' && (
        <Link href="/ngo/field" style={{ display: 'inline-block', marginBottom: 14, color: '#58a6ff', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>{t('back_field')}</Link>
      )}
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2, marginBottom: 18 }}>{isAdmin ? t('sub_admin') : role === 'team_leader' ? t('sub_leader') : t('sub_basic')}</div>

      {loading && <SkeletonRows rows={4} height={64} />}
      {error && !loading && <div style={errorBox}>{error} <button type="button" onClick={load} style={retryBtn}>{t('retry')}</button></div>}
      {msg && <div style={okBox}>{msg}</div>}

      {!loading && role && (
        <>
          {/* Tabs (role-filtered) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {visibleTabs.map((tb) => (
              <button key={tb.id} type="button" onClick={() => { setTab(tb.id); setMsg(null); setError(null) }} style={tabBtn(tab === tb.id)}>{t(`tab_${tb.id}`)}</button>
            ))}
          </div>

          {/* MY ACCOUNT */}
          {tab === 'account' && account && (
            <div style={col}>
              <Section title={t('sec_profile')}>
                <Field label={t('full_name')}><input style={field} value={account.full_name ?? ''} onChange={(e) => setA('full_name', e.target.value)} /></Field>
                <Field label={t('email')} hint={t('email_hint')}><input style={{ ...field, opacity: 0.7 }} value={account.email} disabled /></Field>
                <Field label={t('phone')}><input style={field} value={account.phone ?? ''} onChange={(e) => setA('phone', e.target.value)} /></Field>
                <Field label={t('language')}>
                  <select style={field} value={account.language ?? ''} onChange={(e) => setA('language', e.target.value || null)}>
                    <option value="">{t('system_default')}</option>
                    {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </Field>
              </Section>

              <Section title={t('sec_avail')}>
                <Toggle label={t('off_duty')} checked={account.off_duty} onChange={(v) => setA('off_duty', v)} />
                <div style={{ fontSize: 11, color: '#484f58', marginTop: -4 }}>{t('off_duty_note')}</div>
              </Section>

              <Section title={t('sec_notif_me')}>
                <div style={{ fontSize: 11, color: '#d29922', marginBottom: 8 }}>{t('notif_me_note')}</div>
                <Toggle label={t('push_notif')} checked={account.notif_push} onChange={(v) => setA('notif_push', v)} />
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <Field label={t('quiet_from')}><input type="time" style={field} value={minToTime(account.quiet_start)} onChange={(e) => setA('quiet_start', timeToMin(e.target.value))} /></Field>
                  <Field label={t('quiet_to')}><input type="time" style={field} value={minToTime(account.quiet_end)} onChange={(e) => setA('quiet_end', timeToMin(e.target.value))} /></Field>
                </div>
                <div style={{ fontSize: 11, color: '#484f58' }}>{t('quiet_note')}</div>
                <div style={{ height: 1, background: '#21262d' }} />
                <div style={{ fontSize: 12, color: '#8b949e' }}>{t('which_events')}</div>
                <EventPrefs scope="user" t={t} />
              </Section>

              <Section title={t('sec_push')}>
                <div style={{ fontSize: 12, color: '#8b949e' }}>{t('push_intro')}</div>
                <PushSetup t={t} />
              </Section>

              <button type="button" onClick={saveAccount} disabled={busy || !account.full_name?.trim()} style={{ ...primaryBtn, opacity: busy || !account.full_name?.trim() ? 0.6 : 1 }}>{busy ? t('saving') : t('save_account')}</button>

              <Section title={t('sec_security')}>
                <ChangeCredential isPin={account.role === 'field_coordinator'} onMsg={setMsg} onErr={setError} t={t} />
                {account.role !== 'field_coordinator' && (
                  <div style={{ fontSize: 13, marginTop: 12 }}>
                    {t('twofa_label')} {account.totp_enabled ? <span style={{ color: '#3fb950' }}>{t('on')}</span> : <span style={{ color: '#d29922' }}>{t('off')}</span>}
                    {' · '}<Link href="/ngo/security" style={link}>{t('manage_2fa')}</Link>
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <button type="button" onClick={logoutEverywhere} disabled={busy} style={dangerBtn}>{t('logout_all')}</button>
                  <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>{t('logout_all_note')}</div>
                </div>
              </Section>

              <Section title={t('sec_privacy')}>
                <div style={{ fontSize: 13, display: 'grid', gap: 8 }}>
                  <Link href="/ngo/privacy" style={link}>{t('privacy_summary')}</Link>
                  <Link href="/ngo/privacy/policy" style={link}>{t('privacy_policy')}</Link>
                </div>
              </Section>
            </div>
          )}

          {/* SAFETY (org_admin + team_leader) */}
          {tab === 'safety' && org && (
            <div style={col}>
              <div style={{ fontSize: 12, color: '#8b949e' }}>{t('safety_intro')}</div>
              <Field label={t('checkin_window')} hint={t('checkin_hint')}><input style={field} type="number" min={15} max={10080} value={org.checkin_window_minutes} onChange={(e) => setO('checkin_window_minutes', Number(e.target.value))} /></Field>
              <Field label={t('escal_window')} hint={t('escal_hint')}><input style={field} type="number" min={1} max={1440} value={org.panic_escalation_minutes} onChange={(e) => setO('panic_escalation_minutes', Number(e.target.value))} /></Field>
              <Toggle label={t('show_ack')} checked={org.panic_ack_visible_default} onChange={(v) => setO('panic_ack_visible_default', v)} />
              <div style={{ fontSize: 11, color: '#484f58', marginTop: -8 }}>{t('show_ack_note')}</div>
              <button type="button" onClick={() => patchOrg({ checkin_window_minutes: org.checkin_window_minutes, panic_escalation_minutes: org.panic_escalation_minutes, panic_ack_visible_default: org.panic_ack_visible_default }, t('safety_saved'))} disabled={busy} style={primaryBtn}>{busy ? t('saving') : t('save_safety')}</button>
            </div>
          )}

          {/* DATA & PRIVACY (org_admin) */}
          {tab === 'data' && org && isAdmin && (
            <div style={col}>
              <Section title={t('sec_retention')}>
                <Field label={t('keep_for')} hint={t('keep_hint')}><input style={field} type="number" min={1} max={720} value={org.location_retention_hours} onChange={(e) => setO('location_retention_hours', Number(e.target.value))} /></Field>
                <button type="button" onClick={() => patchOrg({ location_retention_hours: org.location_retention_hours }, t('retention_saved'))} disabled={busy} style={primaryBtn}>{busy ? t('saving') : t('save_retention')}</button>
                <button type="button" onClick={purgeNow} disabled={busy} style={{ ...dangerBtn, marginTop: 10 }}>{t('purge_now')}</button>
                <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>{t('purge_note')}</div>
              </Section>
              <Section title={t('sec_sharing')}>
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>{t('sharing_intro')}</div>
                <Toggle label={t('share_presence')} checked={org.share_team_presence} onChange={(v) => setO('share_team_presence', v)} />
                <Toggle label={t('share_area')} checked={org.share_operational_area} onChange={(v) => setO('share_operational_area', v)} />
                <button type="button" onClick={() => patchOrg({ share_team_presence: org.share_team_presence, share_operational_area: org.share_operational_area }, t('sharing_saved'))} disabled={busy} style={primaryBtn}>{busy ? t('saving') : t('save_sharing')}</button>
              </Section>
              <div style={{ fontSize: 13 }}><Link href="/ngo/privacy" style={link}>{t('how_handles')}</Link></div>
            </div>
          )}

          {/* ORGANISATION (org_admin) */}
          {tab === 'org' && org && isAdmin && (
            <div style={col}>
              <Field label={t('org_name')}><input style={field} value={org.name} onChange={(e) => setO('name', e.target.value)} /></Field>
              <Field label={t('org_type')}><select style={field} value={org.type} onChange={(e) => setO('type', e.target.value)}>{ORG_TYPES.map((ot) => <option key={ot.value} value={ot.value}>{t(`ot_${ot.value}`)}</option>)}</select></Field>
              <Field label={t('country')}><input style={field} value={org.country ?? ''} onChange={(e) => setO('country', e.target.value)} /></Field>
              <button type="button" onClick={() => patchOrg({ name: org.name, type: org.type, country: org.country }, t('org_saved'))} disabled={busy || !org.name.trim()} style={{ ...primaryBtn, opacity: busy || !org.name.trim() ? 0.6 : 1 }}>{busy ? t('saving') : t('save_org')}</button>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {t('op_area')} {org.has_operational_area ? <span style={{ color: '#3fb950' }}>{t('defined')}</span> : <span style={{ color: '#8b949e' }}>{t('not_set')}</span>}
                {' · '}<Link href="/ngo/setup" style={link}>{t('edit_map')}</Link>
              </div>

              {/* ── DANGER ZONE — org_admin only (this whole tab is). Both actions require typing
                  the exact org name. Civilian reports are never affected by anything here. ── */}
              <div style={{ marginTop: 8, background: 'rgba(248,81,73,0.05)', border: '1px solid rgba(248,81,73,0.4)', borderRadius: 10, padding: 16, display: 'grid', gap: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f85149' }}>⚠ {t('danger')}</div>

                {/* Wipe teams & members */}
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#e6edf3' }}>{t('wipe_title')}</div>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>{t('wipe_desc')}</div>
                  {dangerArm !== 'wipe'
                    ? <button type="button" onClick={() => { setDangerArm('wipe'); setConfirmText(''); setMsg(null); setError(null) }} style={dangerBtn}>{t('wipe_btn')}</button>
                    : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <label style={labelStyle}>{t('type_to_confirm_a')} <b style={{ color: '#e6edf3' }}>{org.name}</b> {t('type_to_confirm_b')}</label>
                        <input style={field} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={org.name} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={wipeOrg} disabled={busy || confirmText.trim() !== org.name.trim()} style={{ ...dangerBtn, opacity: busy || confirmText.trim() !== org.name.trim() ? 0.5 : 1 }}>{busy ? t('wiping') : t('wipe_everyone')}</button>
                          <button type="button" onClick={() => { setDangerArm(null); setConfirmText('') }} disabled={busy} style={ghostBtn}>{t('cancel')}</button>
                        </div>
                      </div>
                    )}
                </div>

                {/* Close (delete) the organisation */}
                <div style={{ display: 'grid', gap: 8, borderTop: '1px solid rgba(248,81,73,0.25)', paddingTop: 14 }}>
                  <div style={{ fontSize: 13, color: '#e6edf3' }}>{t('delete_org_title')}</div>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>{t('delete_org_desc_a')} <b>{org.name}</b> {t('delete_org_desc_b')} <span style={{ color: '#3fb950' }}>{t('civ_unaffected')}</span></div>
                  {dangerArm !== 'close'
                    ? <button type="button" onClick={() => { setDangerArm('close'); setConfirmText(''); setMsg(null); setError(null) }} style={dangerBtn}>{t('delete_org_btn')}</button>
                    : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <label style={labelStyle}>{t('type_to_confirm_a')} <b style={{ color: '#e6edf3' }}>{org.name}</b> {t('type_to_confirm_b')}</label>
                        <input style={field} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={org.name} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={closeOrg} disabled={busy || confirmText.trim() !== org.name.trim()} style={{ ...dangerBtn, opacity: busy || confirmText.trim() !== org.name.trim() ? 0.5 : 1 }}>{busy ? t('closing') : t('close_org')}</button>
                          <button type="button" onClick={() => { setDangerArm(null); setConfirmText('') }} disabled={busy} style={ghostBtn}>{t('cancel')}</button>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* PEOPLE & ROLES (links — one home each) */}
          {tab === 'people' && (
            <div style={col}>
              <div style={{ fontSize: 13, color: '#8b949e' }}>{t('people_intro')}</div>
              {isAdmin && <LinkCard href="/ngo/users" title={t('users_title')} desc={t('users_desc')} />}
              <LinkCard href="/ngo/teams" title={t('teams_title')} desc={isAdmin ? t('teams_desc_admin') : t('teams_desc_leader')} />
            </div>
          )}

          {/* NOTIFICATIONS — org defaults (org_admin) */}
          {tab === 'notif' && isAdmin && (
            <div style={col}>
              <div style={{ fontSize: 12, color: '#8b949e' }}>{t('notif_intro')}</div>
              <Section title={t('event_defaults')}>
                <EventPrefs scope="org" t={t} />
              </Section>
              <div style={{ fontSize: 11, color: '#d29922' }}>{t('notif_warn')}</div>
            </div>
          )}

          {/* INTEGRATIONS (org_admin) */}
          {tab === 'integrations' && isAdmin && (
            <div style={col}>
              <LinkCard href="/ngo/chat" title={t('ext_chat_title')} desc={t('ext_chat_desc')} />
              <Section title={t('providers')}>
                <ProviderRow label={t('prov_push')} ok={providers?.push} t={t} />
                <ProviderRow label={t('prov_email')} ok={providers?.email} note={providers?.email ? undefined : t('prov_email_note')} t={t} />
              </Section>
              <Section title={t('delivery_log')}>
                <div style={{ fontSize: 12, color: '#8b949e' }}>{t('log_intro')}</div>
                {log && log.failed_critical > 0 && <div style={{ ...errorBox, marginBottom: 0 }}>{log.failed_critical} {t('failed_a')}</div>}
                {!log && <div style={{ fontSize: 12, color: '#8b949e' }}>{t('loading')}</div>}
                {log && log.entries.length === 0 && <div style={{ fontSize: 12, color: '#484f58' }}>{t('no_sends')}</div>}
                {log && log.entries.length > 0 && (
                  <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                    {log.entries.slice(0, 60).map((e) => {
                      const failed = e.status === 'failed'
                      const colour = failed ? '#f85149' : e.status === 'sent' ? '#3fb950' : '#8b949e'
                      return (
                        <div key={e.id} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', borderBottom: '1px solid #21262d', padding: '4px 0' }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: colour, flexShrink: 0 }} />
                          <span style={{ color: '#c9d1d9', minWidth: 110 }}>{e.event_type}</span>
                          <span style={{ color: '#8b949e', minWidth: 56 }}>{e.urgency}</span>
                          <span style={{ color: '#8b949e', minWidth: 44 }}>{e.channel}</span>
                          <span style={{ color: colour, minWidth: 64 }}>{e.status}</span>
                          <span style={{ color: '#484f58', marginLeft: 'auto' }}>{new Date(e.created_at).toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>
              <div style={{ fontSize: 12, color: '#484f58' }}>{t('api_planned')}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ChangeCredential({ isPin, onMsg, onErr, t }: { isPin: boolean; onMsg: (m: string) => void; onErr: (e: string) => void; t: (k: string) => string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); onErr('');
    try {
      const body: Record<string, string> = { current }
      if (isPin) body.new_pin = next; else body.new_password = next
      const res = await fetch('/api/ngo/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { onMsg(isPin ? t('pin_changed') : t('pw_changed')); setCurrent(''); setNext('') }
      else onErr(d.error ?? t('e_cred'))
    } catch { onErr(t('e_cred')) }
    finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label={isPin ? t('cur_pin') : t('cur_pw')}><input type="password" style={field} value={current} onChange={(e) => setCurrent(e.target.value)} inputMode={isPin ? 'numeric' : undefined} /></Field>
      <Field label={isPin ? t('new_pin') : t('new_pw')}><input type="password" style={field} value={next} onChange={(e) => setNext(e.target.value)} inputMode={isPin ? 'numeric' : undefined} /></Field>
      <button type="button" onClick={submit} disabled={busy || !next} style={{ ...primaryBtn, opacity: busy || !next ? 0.6 : 1 }}>{busy ? '…' : isPin ? t('change_pin') : t('change_pw')}</button>
    </div>
  )
}

// Per-event channel preferences for the tunable NORMAL/LOW events. scope='user' edits the
// signed-in user's prefs; scope='org' (org_admin) edits org defaults. Saves on each toggle.
function EventPrefs({ scope, t }: { scope: 'user' | 'org'; t: (k: string) => string }) {
  const [data, setData] = useState<{ events: string[]; user: any; org?: any } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/ngo/notify/prefs', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => setErr(t('e_prefs')))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const rows = scope === 'org' ? data?.org : data?.user
  const set = async (event: string, patch: Record<string, boolean>) => {
    if (!data) return
    const cur = (scope === 'org' ? data.org : data.user)[event]
    const next = { ...cur, ...patch }
    setData({ ...data, ...(scope === 'org' ? { org: { ...data.org, [event]: next } } : { user: { ...data.user, [event]: next } }) })
    await fetch('/api/ngo/notify/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, event, ...next }) }).catch(() => setErr(t('e_save')))
  }
  if (err) return <div style={{ fontSize: 12, color: '#f85149' }}>{err}</div>
  if (!data || !rows) return <div style={{ fontSize: 12, color: '#8b949e' }}>{t('loading')}</div>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {data.events.map((e) => {
        const v = rows[e]
        return (
          <div key={e} style={{ borderTop: '1px solid #21262d', paddingTop: 8 }}>
            <div style={{ fontSize: 13, color: '#e6edf3', marginBottom: 4 }}>{t(`ev_${e}`)}</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#8b949e' }}>
              {scope === 'org' && <Mini label={t('m_enabled')} checked={v.enabled} onChange={(c) => set(e, { enabled: c })} />}
              <Mini label={t('m_push')} checked={v.push} onChange={(c) => set(e, { push: c })} />
              <Mini label={t('m_email')} checked={v.email} onChange={(c) => set(e, { email: c })} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
function Mini({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
}

function ProviderRow({ label, ok, note, t }: { label: string; ok?: boolean; note?: string; t: (k: string) => string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '4px 0' }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: ok ? '#3fb950' : '#8b949e', flexShrink: 0 }} />
      <span style={{ color: '#e6edf3' }}>{label}</span>
      <span style={{ color: ok ? '#3fb950' : '#8b949e' }}>{ok ? t('configured') : t('not_configured')}</span>
      {note && <span style={{ color: '#484f58', fontSize: 11 }}>· {note}</span>}
    </div>
  )
}

// Self-contained ntfy push setup: download links, the org's subscribe topic (+ QR and
// one-tap links), a short tutorial, and a test-push button. Visible to every role (it lives
// in the My-account tab) so field coordinators get it too. Fetches its own data.
function PushSetup({ t }: { t: (k: string) => string }) {
  const [info, setInfo] = useState<{ topic: string; subscribeUrl: string; deepLink: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ngo/notify/topic', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.topic) setInfo(d); else setErr(t('ps_not_ready')) })
      .catch(() => setErr(t('ps_e_load')))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // QR of the subscribe URL — generated client-side, same dynamic-import pattern as 2FA.
  useEffect(() => {
    if (!info) return
    let off = false
    import('qrcode').then((QR) => QR.toDataURL(info.subscribeUrl, { width: 200, margin: 1 }))
      .then((u) => { if (!off) setQr(u) }).catch(() => {})
    return () => { off = true }
  }, [info])

  async function sendTest() {
    setBusy(true); setTestMsg(null)
    try {
      const res = await fetch('/api/ngo/notify/test', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.status === 429) setTestMsg(t('ps_test_429'))
      else if (d.stubbed) setTestMsg(t('ps_test_stub'))
      else if (d.ok) setTestMsg(t('ps_test_ok'))
      else setTestMsg(t('ps_test_fail'))
    } catch { setTestMsg(t('ps_test_fail2')) }
    finally { setBusy(false) }
  }

  if (err) return <div style={{ fontSize: 12, color: '#8b949e' }}>{err}</div>
  if (!info) return <div style={{ fontSize: 12, color: '#8b949e' }}>{t('loading')}</div>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, color: '#e6edf3', marginBottom: 4 }}>{t('ps_step1')}</div>
        <div style={{ fontSize: 12, color: '#8b949e' }}>
          <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer noopener" style={link}>{t('ps_iphone')}</a>{' · '}
          <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer noopener" style={link}>{t('ps_android_play')}</a>{' · '}
          <a href="https://f-droid.org/packages/io.heckel.ntfy/" target="_blank" rel="noreferrer noopener" style={link}>{t('ps_android_fdroid')}</a>{' · '}
          <a href="https://ntfy.sh/app" target="_blank" rel="noreferrer noopener" style={link}>{t('ps_web')}</a>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, color: '#e6edf3', marginBottom: 4 }}>{t('ps_step2')}</div>
        <code style={{ display: 'block', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px', fontSize: 13, wordBreak: 'break-all', color: '#e6edf3' }}>{info.topic}</code>
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
          <a href={info.subscribeUrl} target="_blank" rel="noreferrer noopener" style={link}>{t('ps_open_browser')}</a>{' · '}
          <a href={info.deepLink} style={link}>{t('ps_open_app')}</a>
        </div>
        {qr
          ? <img src={qr} alt="Subscribe QR code" width={180} height={180} style={{ background: '#fff', borderRadius: 8, padding: 6, marginTop: 8 }} />
          : <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8 }}>{t('ps_gen_qr')}</div>}
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>{t('ps_scan_note')}</div>
      </div>

      <ol style={{ fontSize: 12, color: '#8b949e', paddingInlineStart: 18, margin: 0, display: 'grid', gap: 4 }}>
        <li>{t('ps_li1')}</li>
        <li>{t('ps_li2')}</li>
        <li>{t('ps_li3')}</li>
        <li>{t('ps_li4')}</li>
        <li>{t('ps_li5')}</li>
      </ol>

      <button type="button" onClick={sendTest} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? t('ps_sending') : t('ps_send_test')}</button>
      {testMsg && <div style={{ fontSize: 12, color: '#8b949e' }}>{testMsg}</div>}
    </div>
  )
}

function LinkCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} style={{ display: 'block', background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14, textDecoration: 'none' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{title} →</div>
      <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3 }}>{desc}</div>
    </a>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  )
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#484f58', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#e6edf3', cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
      {label}
    </label>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 720, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const col: React.CSSProperties = { display: 'grid', gap: 16, maxWidth: 480 }
const field: React.CSSProperties = { width: '100%', height: 44, padding: '0 12px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 16, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const link: React.CSSProperties = { color: '#58a6ff', textDecoration: 'none' }
const primaryBtn: React.CSSProperties = { minHeight: 44, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', justifySelf: 'start' }
const dangerBtn: React.CSSProperties = { minHeight: 40, padding: '0 16px', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', justifySelf: 'start' }
const ghostBtn: React.CSSProperties = { minHeight: 40, padding: '0 16px', background: 'transparent', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const okBox: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
function tabBtn(active: boolean): React.CSSProperties {
  return { minHeight: 36, padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.15)' : '#161b22', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
