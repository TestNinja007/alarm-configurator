// Regenerates docs/seed.md from the fixtures, so the document cannot drift
// from the data the seed actually inserts. Run with `npm run docs:seed`.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, repoRoot } from '../src/api/src/config.js';
import { SEED_ALARMS, SEED_FOLDERS } from '../src/api/src/seed/fixtures.js';
import { SEED_USERS } from '../src/api/src/seed/users.js';
import { anchorDate } from '../src/api/src/seed/index.js';
import { describeRuleText } from '../src/api/src/seed/describe.js';

const lines: string[] = [];
lines.push('# Seed data');
lines.push('');
lines.push('Generated from `src/api/src/seed/fixtures.ts`. Do not edit by hand; change the');
lines.push('fixtures and run `npm run docs:seed`.');
lines.push('');
lines.push('Every date below is derived from `SEED_ANCHOR`, shown here resolved against its');
lines.push('default of `' + config.seedAnchor + '`. Change the variable and every date moves with it.');
lines.push('');
lines.push('Two profiles exist. `empty` creates the two users and nothing else. `demo`');
lines.push('creates everything on this page. Resetting twice produces byte-identical rows.');
lines.push('');
lines.push('## Users');
lines.push('');
lines.push('| Key | Id | Email | Password | Name |');
lines.push('| --- | --- | --- | --- | --- |');
for (const user of SEED_USERS) {
  lines.push(`| \`${user.externalKey}\` | \`${user.id}\` | ${user.email} | \`${user.password}\` | ${user.name} |`);
}
lines.push('');
lines.push('## Folders');
lines.push('');
lines.push('| Key | Id | Owner | Name | Alarms |');
lines.push('| --- | --- | --- | --- | --- |');
for (const folder of SEED_FOLDERS) {
  const count = SEED_ALARMS.filter((a) => a.folderKey === folder.externalKey).length;
  lines.push(`| \`${folder.externalKey}\` | \`${folder.id}\` | \`${folder.userKey}\` | ${folder.name} | ${count} |`);
}
lines.push('');
lines.push('## Alarms');
lines.push('');
lines.push('Every row has a distinct minute-of-hour and every zone used is a whole-hour');
lines.push('offset from UTC, so no two seeded alarms can ever share an instant. The demo');
lines.push('profile therefore never violates R-08, and every folder\u2019s conflicts panel starts');
lines.push('empty.');
lines.push('');
for (const folder of SEED_FOLDERS) {
  const alarms = SEED_ALARMS.filter((a) => a.folderKey === folder.externalKey);
  if (alarms.length === 0) continue;
  lines.push(`### ${folder.name} (\`${folder.externalKey}\`, owner \`${folder.userKey}\`)`);
  lines.push('');
  lines.push('| Key | Id | Name | Time | Zone | Starts | Ends | Repeats | Enabled |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const alarm of alarms) {
    const ends =
      alarm.endOffsetDays !== null
        ? anchorDate(alarm.endOffsetDays)
        : alarm.endAfterOccurrences !== null
          ? `after ${alarm.endAfterOccurrences}`
          : 'never';
    lines.push(
      `| \`${alarm.externalKey}\` | \`${alarm.id}\` | ${alarm.name} | ${alarm.timeOfDay} | ${alarm.timezone} | ${anchorDate(alarm.startOffsetDays)} | ${ends} | ${describeRuleText(alarm.rule)} | ${alarm.enabled ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');
  lines.push('Why these records exist:');
  lines.push('');
  for (const alarm of alarms) {
    lines.push(`- **${alarm.name}** \u2014 ${alarm.purpose}`);
  }
  lines.push('');
}
lines.push('## Referring to these records');
lines.push('');
lines.push('Ids are fixed, so a test can use them directly. Each row also carries an');
lines.push('`external_key` column holding the slug in the first column above, which survives');
lines.push('a rename of the display name:');
lines.push('');
lines.push('```sql');
lines.push("SELECT id FROM alarms WHERE external_key = 'alarm-invoice-on-the-31st';");
lines.push('```');
lines.push('');

writeFileSync(resolve(repoRoot, 'docs', 'seed.md'), lines.join('\n'), 'utf8');
console.log('Wrote docs/seed.md');
