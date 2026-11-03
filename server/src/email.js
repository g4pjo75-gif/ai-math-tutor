// server/src/email.js — Resend 기반 라이선스 키 이메일 발송 및 복구
const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendViaResend(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'email_not_configured' };
  }
  const from = env.MAIL_FROM || 'AI Math Tutor <noreply@resend.dev>';

  const payload = {
    from,
    to: [to],
    subject,
    html,
    text
  };

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMessage = (data && data.message) || `resend_${res.status}`;
      return { ok: false, error: errMessage };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err.message || 'network_error' };
  }
}

export async function sendLicenseEmail(env, { to, key, sessionId }) {
  if (!to || !key) return { ok: false, error: 'invalid_params' };
  if (!env.RESEND_API_KEY) return { ok: false, error: 'email_not_configured' };

  const baseUrl = (env.SITE_BASE_URL || 'https://g4pjo75-gif.github.io/ai-math-tutor').replace(/\/+$/, '');
  const thanksUrl = sessionId ? `${baseUrl}/site/thanks.html?session_id=${encodeURIComponent(sessionId)}` : '';
  const recoverUrl = `${baseUrl}/site/recover.html`;
  const supportEmail = env.SUPPORT_EMAIL || 'support@example.com';

  const subject = '【AI家庭教師】ご購入ありがとうございます（ライセンスキーのご案内）';
  const text = [
    'AI家庭教師をご購入いただきありがとうございます。',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `ライセンスキー: ${key}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '■ ご利用方法',
    'AI家庭教師の設定画面（⚙️）を開き、上記ライセンスキーを入力して登録してください。',
    thanksUrl ? `購入完了ページ: ${thanksUrl}` : '',
    '',
    '■ キーを紛失した場合',
    'いつでも以下のページからメールアドレス宛に再送できます:',
    recoverUrl,
    '',
    '■ お問い合わせ',
    supportEmail,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>ご購入ありがとうございます</h2>
      <p>AI家庭教師のスタンダードプランへのご加入が完了しました。</p>
      <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">ライセンスキー</div>
        <div style="font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #0f172a; font-family: monospace;">${key}</div>
      </div>
      <p><strong>ご利用手順:</strong><br>
      アプリの設定画面（⚙️）を開き、上記のライセンスキーを入力してください（最大2台の端末でご利用いただけます）。</p>
      ${thanksUrl ? `<p><a href="${thanksUrl}">購入完了ページはこちら</a></p>` : ''}
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
      <p style="font-size: 13px; color: #64748b;">
        キーを紛失した場合は、<a href="${recoverUrl}">ライセンスキー再送ページ</a>からいつでも確認できます。<br>
        お問い合わせ: <a href="mailto:${supportEmail}">${supportEmail}</a>
      </p>
    </div>
  `.trim();

  return sendViaResend(env, { to, subject, html, text });
}

export async function sendRecoveryEmail(env, { to, key, sessionId }) {
  if (!to || !key) return { ok: false, error: 'invalid_params' };
  if (!env.RESEND_API_KEY) return { ok: false, error: 'email_not_configured' };

  const baseUrl = (env.SITE_BASE_URL || 'https://g4pjo75-gif.github.io/ai-math-tutor').replace(/\/+$/, '');
  const thanksUrl = sessionId ? `${baseUrl}/site/thanks.html?session_id=${encodeURIComponent(sessionId)}` : '';
  const recoverUrl = `${baseUrl}/site/recover.html`;
  const supportEmail = env.SUPPORT_EMAIL || 'support@example.com';

  const subject = '【AI家庭教師】ライセンスキーの再送';
  const text = [
    'AI家庭教師のライセンスキー再送リクエストを受け付けました。',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `ライセンスキー: ${key}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '■ ご利用方法',
    'AI家庭教師の設定画面（⚙️）を開き、上記ライセンスキーを入力して登録してください。',
    thanksUrl ? `購入完了ページ: ${thanksUrl}` : '',
    '',
    'お心当たりがない場合は、このメールを破棄してください。',
    `サポート: ${supportEmail}`
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>ライセンスキーの再送</h2>
      <p>ライセンスキーの再送リクエストを受け付けました。</p>
      <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">ライセンスキー</div>
        <div style="font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #0f172a; font-family: monospace;">${key}</div>
      </div>
      <p>アプリの設定画面（⚙️）にて登録してください。</p>
      <p style="font-size: 13px; color: #64748b;">
        心当たりがない場合は、このメールを破棄してください。<br>
        お問い合わせ: <a href="mailto:${supportEmail}">${supportEmail}</a>
      </p>
    </div>
  `.trim();

  return sendViaResend(env, { to, subject, html, text });
}
