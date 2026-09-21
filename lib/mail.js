/* =============================================================================
 *  E-Mail-Versand — austauschbare Anbieterschicht
 *
 *  Gleiches Muster wie close.js und hubspot.js: Der Kern kennt nur `versende`,
 *  welcher Dienst dahinter steckt entscheidet eine Umgebungsvariable. Ein
 *  Anbieterwechsel ist damit ein Wert in Netlify, keine Codeaenderung.
 *
 *  Warum ein Transaktionsdienst und nicht Gmail: Der Ruf einer Absenderdomain
 *  haengt an SPF, DKIM und DMARC. Auf gmail.com laesst sich keine eigene
 *  DMARC-Richtlinie setzen, die Domain gehoert Google. Auf finanz-medizin.com
 *  schon — und eine Praxis liest Post von benedict@finanz-medizin.com anders
 *  als von einer Freemail-Adresse.
 *
 *  Umgebungsvariablen
 *    MAIL_API_KEY    Pflicht. Schluessel des Anbieters
 *    MAIL_FROM       Pflicht. "Benedict Hintz <benedict@finanz-medizin.com>"
 *    MAIL_PROVIDER   optional, Standard "brevo" — brevo | resend | postmark
 *    MAIL_REPLY_TO   optional. Abweichende Antwortadresse
 *
 *  Nur Standardbibliothek. fetch ist ab Node 18 eingebaut.
 * ========================================================================== */

'use strict';

/* "Name <adresse@example.com>" in seine beiden Teile zerlegen. Postmark und
   Brevo wollen Name und Adresse getrennt, Resend nimmt die ganze Zeile. */
function zerlegeAbsender(zeile) {
  const treffer = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(String(zeile || ''));
  if (treffer) return { name: treffer[1].replace(/^"|"$/g, ''), adresse: treffer[2].trim() };
  return { name: '', adresse: String(zeile || '').trim() };
}

async function schicke(url, kopfzeilen, rumpf) {
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, kopfzeilen),
    body: JSON.stringify(rumpf)
  });

  const text = await res.text();
  if (!res.ok) {
    const f = new Error('Mailversand abgelehnt (' + res.status + ')');
    f.status = res.status;
    f.detail = text.slice(0, 400);
    throw f;
  }
  try { return JSON.parse(text); } catch (e) { return {}; }
}

/* ------------------------------------------------------------- Anbieter */
const ANBIETER = {
  resend: function (schluessel, absender, mail) {
    const rumpf = {
      from: absender.name ? absender.name + ' <' + absender.adresse + '>' : absender.adresse,
      to: [mail.an],
      subject: mail.betreff,
      text: mail.text
    };
    if (mail.html) rumpf.html = mail.html;
    if (mail.antwortAn) rumpf.reply_to = mail.antwortAn;
    if (mail.anhang) {
      rumpf.attachments = [{
        filename: mail.anhang.name,
        content: Buffer.from(mail.anhang.inhalt, 'utf8').toString('base64')
      }];
    }
    return schicke('https://api.resend.com/emails',
      { 'Authorization': 'Bearer ' + schluessel }, rumpf);
  },

  postmark: function (schluessel, absender, mail) {
    const rumpf = {
      From: absender.name ? absender.name + ' <' + absender.adresse + '>' : absender.adresse,
      To: mail.an,
      Subject: mail.betreff,
      TextBody: mail.text,
      MessageStream: 'outbound'
    };
    if (mail.html) rumpf.HtmlBody = mail.html;
    if (mail.antwortAn) rumpf.ReplyTo = mail.antwortAn;
    if (mail.anhang) {
      rumpf.Attachments = [{
        Name: mail.anhang.name,
        Content: Buffer.from(mail.anhang.inhalt, 'utf8').toString('base64'),
        ContentType: mail.anhang.typ || 'text/calendar'
      }];
    }
    return schicke('https://api.postmarkapp.com/email',
      { 'X-Postmark-Server-Token': schluessel, 'Accept': 'application/json' }, rumpf);
  },

  brevo: function (schluessel, absender, mail) {
    const rumpf = {
      sender: { email: absender.adresse, name: absender.name || undefined },
      to: [{ email: mail.an, name: mail.anName || undefined }],
      subject: mail.betreff,
      textContent: mail.text
    };
    if (mail.html) rumpf.htmlContent = mail.html;
    if (mail.antwortAn) rumpf.replyTo = { email: mail.antwortAn };
    if (mail.anhang) {
      rumpf.attachment = [{
        name: mail.anhang.name,
        content: Buffer.from(mail.anhang.inhalt, 'utf8').toString('base64')
      }];
    }
    return schicke('https://api.brevo.com/v3/smtp/email',
      { 'api-key': schluessel, 'Accept': 'application/json' }, rumpf);
  }
};

/* --------------------------------------------------------------- Zugang */
function mailKonfig(env) {
  const schluessel = env && env.MAIL_API_KEY;
  const von = env && env.MAIL_FROM;
  if (!schluessel || !von) return null;

  const name = String((env.MAIL_PROVIDER || 'brevo')).trim().toLowerCase();
  if (!ANBIETER[name]) return null;

  return {
    anbieter: name,
    schluessel: schluessel,
    absender: zerlegeAbsender(von),
    antwortAn: env.MAIL_REPLY_TO || null
  };
}

/* Verschickt eine Mail. Wirft bei Fehlschlag — der Aufrufer entscheidet, ob
   das den Vorgang kippen darf. Bei Buchung und Erinnerung darf es das nicht. */
async function versende(env, mail) {
  const k = mailKonfig(env);
  if (!k) {
    const f = new Error('Mailversand nicht eingerichtet (MAIL_API_KEY / MAIL_FROM fehlen)');
    f.fehlendeKonfiguration = true;
    throw f;
  }
  if (!mail || !mail.an || !mail.betreff || !mail.text) {
    throw new Error('Mail unvollstaendig: an, betreff und text sind Pflicht.');
  }

  const fertig = Object.assign({}, mail);
  if (!fertig.antwortAn && k.antwortAn) fertig.antwortAn = k.antwortAn;

  return ANBIETER[k.anbieter](k.schluessel, k.absender, fertig);
}

module.exports = { versende, mailKonfig, zerlegeAbsender };
