'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { ermittleEmpfaenger } = require('../src/recipient.js');
const { FakeHubSpot, testKonfig, musterKontakt } = require('./helpers.js');

function aufbau(ueberschreibungen) {
  return { cfg: testKonfig(ueberschreibungen), hubspot: new FakeHubSpot() };
}
const alsDatensatz = (h, typ, id) => h.datensatz(typ, id);

/* ------------------------------------------------------------- Kontakt */

test('Kontakt: die eigene Adresse', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('contacts', '1', musterKontakt());

  const ziel = await ermittleEmpfaenger('contacts', await alsDatensatz(hubspot, 'contacts', '1'), hubspot, cfg);
  assert.strictEqual(ziel.email, 'max.mustermann@example.com');
  assert.strictEqual(ziel.quelle, 'kontakt.email');
});

test('Kontakt: eine Vorgabe schlaegt die eigene Adresse', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('contacts', '1', musterKontakt({ automation_email_recipient: 'anders@example.com' }));

  const ziel = await ermittleEmpfaenger('contacts', await alsDatensatz(hubspot, 'contacts', '1'), hubspot, cfg);
  assert.strictEqual(ziel.email, 'anders@example.com');
  assert.strictEqual(ziel.quelle, 'vorgabe');
});

test('Kontakt: eine kaputte Vorgabe wird nicht stillschweigend uebergangen', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('contacts', '1', musterKontakt({ automation_email_recipient: 'kein-at-zeichen' }));

  await assert.rejects(async () => {
    await ermittleEmpfaenger('contacts', await alsDatensatz(hubspot, 'contacts', '1'), hubspot, cfg);
  }, /keine gueltige E-Mail-Adresse/);
});

test('Kontakt ohne Adresse liefert einen Empfaengerfehler, keinen Versand', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('contacts', '1', musterKontakt({ email: '' }));

  await assert.rejects(async () => {
    await ermittleEmpfaenger('contacts', await alsDatensatz(hubspot, 'contacts', '1'), hubspot, cfg);
  }, (e) => e.empfaengerProblem === true && /keine E-Mail-Adresse/.test(e.message));
});

/* --------------------------------------------------------- Unternehmen */

test('Unternehmen mit genau einem Kontakt: eindeutig, also erlaubt', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('companies', '10', { name: 'Praxis Dr. Meier' });
  hubspot.lege('contacts', '1', musterKontakt());
  hubspot.verknuepfe('companies', '10', 'contacts', ['1']);

  const ziel = await ermittleEmpfaenger('companies', await alsDatensatz(hubspot, 'companies', '10'), hubspot, cfg);
  assert.strictEqual(ziel.email, 'max.mustermann@example.com');
  assert.strictEqual(ziel.quelle, 'unternehmen.einzelkontakt');
  assert.strictEqual(ziel.unternehmen.properties.name, 'Praxis Dr. Meier');
});

test('Unternehmen mit mehreren Kontakten: lieber nichts als an alle', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('companies', '10', { name: 'Gemeinschaftspraxis' });
  hubspot.lege('contacts', '1', musterKontakt());
  hubspot.lege('contacts', '2', musterKontakt({ email: 'anna@example.com' }));
  hubspot.verknuepfe('companies', '10', 'contacts', ['1', '2']);

  await assert.rejects(async () => {
    await ermittleEmpfaenger('companies', await alsDatensatz(hubspot, 'companies', '10'), hubspot, cfg);
  }, (e) => {
    assert.strictEqual(e.code, 'EMPFAENGER_MEHRDEUTIG');
    assert.match(e.message, /automation_email_contact_id/, 'nennt den Ausweg');
    assert.deepStrictEqual(e.kandidaten, ['1', '2'], 'nennt die Kandidaten');
    return true;
  });
});

test('Unternehmen mit benanntem Ansprechpartner: auch bei zehn Kontakten eindeutig', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('companies', '10', { name: 'Gemeinschaftspraxis', automation_email_contact_id: '2' });
  for (let i = 1; i <= 10; i++) hubspot.lege('contacts', String(i), musterKontakt({ email: 'k' + i + '@example.com' }));
  hubspot.verknuepfe('companies', '10', 'contacts', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

  const ziel = await ermittleEmpfaenger('companies', await alsDatensatz(hubspot, 'companies', '10'), hubspot, cfg);
  assert.strictEqual(ziel.email, 'k2@example.com');
  assert.strictEqual(ziel.quelle, 'unternehmen.ansprechpartner');
});

test('Unternehmen mit ins Leere zeigendem Ansprechpartner', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('companies', '10', { name: 'Praxis', automation_email_contact_id: '999' });

  await assert.rejects(async () => {
    await ermittleEmpfaenger('companies', await alsDatensatz(hubspot, 'companies', '10'), hubspot, cfg);
  }, /existiert nicht/);
});

test('Unternehmen ohne verknuepften Kontakt', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('companies', '10', { name: 'Praxis' });

  await assert.rejects(async () => {
    await ermittleEmpfaenger('companies', await alsDatensatz(hubspot, 'companies', '10'), hubspot, cfg);
  }, /kein Kontakt verknuepft/);
});

test('Unternehmen: ohne Einzelkontakt-Fallback wird der Ansprechpartner erzwungen', async () => {
  const { cfg, hubspot } = aufbau({ RECIPIENT_SINGLE_CONTACT_FALLBACK: 'false' });
  hubspot.lege('companies', '10', { name: 'Praxis' });
  hubspot.lege('contacts', '1', musterKontakt());
  hubspot.verknuepfe('companies', '10', 'contacts', ['1']);

  await assert.rejects(async () => {
    await ermittleEmpfaenger('companies', await alsDatensatz(hubspot, 'companies', '10'), hubspot, cfg);
  }, /kein Ansprechpartner/);
});

/* ---------------------------------------------------------------- Lead */

test('Lead ueber den verknuepften Kontakt', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('leads', '77', { hs_lead_name: 'Dr. Meier' });
  hubspot.lege('contacts', '1', musterKontakt());
  hubspot.verknuepfe('leads', '77', 'contacts', ['1']);

  const ziel = await ermittleEmpfaenger('leads', await alsDatensatz(hubspot, 'leads', '77'), hubspot, cfg);
  assert.strictEqual(ziel.email, 'max.mustermann@example.com');
  assert.strictEqual(ziel.quelle, 'lead.kontakt');
});

test('Lead ohne Kontakt, aber mit eindeutigem Unternehmen', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('leads', '77', { hs_lead_name: 'Praxis Meier' });
  hubspot.lege('companies', '10', { name: 'Praxis Meier' });
  hubspot.lege('contacts', '1', musterKontakt());
  hubspot.verknuepfe('leads', '77', 'companies', ['10']);
  hubspot.verknuepfe('companies', '10', 'contacts', ['1']);

  const ziel = await ermittleEmpfaenger('leads', await alsDatensatz(hubspot, 'leads', '77'), hubspot, cfg);
  assert.strictEqual(ziel.email, 'max.mustermann@example.com');
  assert.match(ziel.quelle, /^lead\.unternehmen\./);
});

test('Lead mit mehreren Kontakten bleibt liegen', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('leads', '77', {});
  hubspot.lege('contacts', '1', musterKontakt());
  hubspot.lege('contacts', '2', musterKontakt({ email: 'anna@example.com' }));
  hubspot.verknuepfe('leads', '77', 'contacts', ['1', '2']);

  await assert.rejects(async () => {
    await ermittleEmpfaenger('leads', await alsDatensatz(hubspot, 'leads', '77'), hubspot, cfg);
  }, /2 Kontakte mit E-Mail-Adresse/);
});

test('Lead ganz ohne Verknuepfung', async () => {
  const { cfg, hubspot } = aufbau();
  hubspot.lege('leads', '77', {});

  await assert.rejects(async () => {
    await ermittleEmpfaenger('leads', await alsDatensatz(hubspot, 'leads', '77'), hubspot, cfg);
  }, /keinen verknuepften Kontakt/);
});
