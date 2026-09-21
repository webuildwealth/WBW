/* =============================================================================
 *  Die Zustaende einer Mail
 *
 *  Die sechs Zustaende aus der Anforderung plus zwei, die der Betrieb braucht:
 *
 *    sending        Die Mail ist gerade unterwegs. Genau zwischen "Anspruch im
 *                   Ledger gesetzt" und "Gmail hat quittiert" liegt das
 *                   gefaehrliche Fenster; ohne eigenen Zustand waere von aussen
 *                   nicht zu sehen, dass hier jemand arbeitet.
 *
 *    needs_review   Es ist nicht sicher zu klaeren, ob die Mail raus ist
 *                   (abgerissene Verbindung im falschen Moment). Hier wird
 *                   bewusst nichts automatisch wiederholt: eine fehlende Mail
 *                   ist reparierbar, eine doppelte nicht.
 * ========================================================================== */

'use strict';

const STATUS = {
  DRAFT: 'draft',
  QUEUED: 'queued',
  SCHEDULED: 'scheduled',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  NEEDS_REVIEW: 'needs_review'
};

/* Reihenfolge = Reihenfolge im HubSpot-Auswahlfeld. */
const ALLE = [
  STATUS.DRAFT, STATUS.QUEUED, STATUS.SCHEDULED, STATUS.SENDING,
  STATUS.SENT, STATUS.FAILED, STATUS.CANCELLED, STATUS.NEEDS_REVIEW
];

const BESCHRIFTUNG = {
  draft: 'Entwurf',
  queued: 'Zum Versand freigegeben',
  scheduled: 'Geplant',
  sending: 'Wird gesendet',
  sent: 'Versendet',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
  needs_review: 'Pruefung noetig'
};

/* Nur aus diesen Zustaenden heraus wird ueberhaupt etwas unternommen. */
const AUSLOESEND = [STATUS.QUEUED, STATUS.SCHEDULED];

/* Diese Zustaende fasst die Automation nie von sich aus wieder an. */
const ENDGUELTIG = [STATUS.SENT, STATUS.CANCELLED, STATUS.NEEDS_REVIEW];

const istAusloesend = (s) => AUSLOESEND.indexOf(String(s || '').toLowerCase()) !== -1;
const istEndgueltig = (s) => ENDGUELTIG.indexOf(String(s || '').toLowerCase()) !== -1;

module.exports = { STATUS, ALLE, BESCHRIFTUNG, AUSLOESEND, ENDGUELTIG, istAusloesend, istEndgueltig };
