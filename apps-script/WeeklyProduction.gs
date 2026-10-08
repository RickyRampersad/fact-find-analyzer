/**
 * WeeklyProduction.gs — the branch production report, sent every Friday.
 *
 * WHAT WAS ASKED
 *   17 September 2026: the wall's spreadsheet ("its just the first sheet"),
 *   sent automatically at 3pm every Friday to
 *   rickyrampersadsalessupport@myguardiangroup.com, subject "Weekly
 *   Production Ricky Rampersad Branch Week no". Asked after on 8 October 2026
 *   as "the production report to be downloaded and sent to head office
 *   weekly" - and it was not being sent.
 *
 * WHY THE FIRST VERSION NEVER WENT
 *   rrbWeeklyProductionSend (September) mailed a tab of a spreadsheet, and the
 *   tab it was pointed at was the settlement export: the preview arrived
 *   "showing the settled not production". The production sheet is not stored
 *   in any spreadsheet. The wall builds it in the browser from Salesforce each
 *   time somebody presses Spreadsheet, so there was never a tab holding it to
 *   attach. Its Friday trigger was never switched on.
 *
 * WHAT THIS SENDS
 *   The SUBMITTED sheet - unit, then manager, then every advisor with their
 *   code, across the week, the month to date and the year - built here from
 *   the figures the wall itself reads: sfBoardData_ (pbSalesforce.gs) for the
 *   week and the month, reshaped by fyrBoard_ (FinancialYear.gs) so the year
 *   counts from 1 October and the advisors are the Access tab's, under their
 *   units. Production means picked up: new business on its Production Picked
 *   Up Date and increases on theirs. Same columns, order, colours and
 *   blank-stays-blank as the first sheet of the wall's download, so it is the
 *   sheet the branch already recognises. One sheet, as an .xlsx.
 *
 *   It will not send without FinancialYear.gs in the project. Without it the
 *   year would count from 1 January under last year's units, and a wrong
 *   report at head office is worse than a late one. The owner is told why.
 *
 * PUT IT IN
 *   1. + next to Files > Script. Name it WeeklyProduction. Paste this file.
 *   2. Run wprPreview. One copy comes to you alone, subject marked [PREVIEW].
 *   3. Run wprSetup. Fridays at 3pm, Port of Spain time. It also removes the
 *      old settled-sheet triggers, so that report cannot go out by mistake.
 *   No deployment is needed: nothing here answers a web request.
 *
 *   wprStatus  what is scheduled, who it goes to, how the last run went
 *   wprSendNow this week's report to the real recipients, now
 *   wprStop    takes the Friday send off
 *
 * Every name here starts with wpr, so nothing collides with the project.
 */

var WPR_TO   = 'rickyrampersadsalessupport@myguardiangroup.com';
var WPR_CC   = '';        // more recipients, comma-separated (head office, if direct)
var WPR_DAY  = 'FRIDAY';
var WPR_HOUR = 15;        // 3pm. Apps Script runs it within about 15 minutes of this.
var WPR_TZ   = 'America/Port_of_Spain';

/* A blind copy to the Branch Manager, so the branch has exactly what went. */
var WPR_COPY_BRANCH = true;

/* The September sender's triggers. wprSetup removes them. */
var WPR_OLD_TRIGGERS = ['rrbWeeklyProductionSend', 'rrbWeeklyProductionSend_OneOff'];

var WPR_LAST = 'wpr_last';       // script property: how the last run went
var WPR_SENT = 'wpr_sent_week';  // script property: the ISO week last sent

/* ── the board ─────────────────────────────────────────────────────────── */

/* The SUBMITTED board as the wall has it right now. */
function wprBoard_() {
  if (typeof fyrBoard_ !== 'function') {
    throw new Error('FinancialYear.gs is not in this project, so the year would count from ' +
                    '1 January under last year\'s units. Put FinancialYear.gs in first.');
  }
  var d = fyrBoard_(sfBoardData_());
  var S = d && d.submitted;
  if (!S || !S.rows || !S.rows.length) throw new Error('Salesforce answered with no board rows.');
  return S;
}

/* The ISO week, and the Monday it started, from the branch's own calendar.
   The dates are UTC midnights of the branch's days, so they are formatted in
   UTC; formatting them in Port of Spain would show the day before. */
function wprWeek_(now) {
  var p = Utilities.formatDate(now, WPR_TZ, 'yyyy-M-d').split('-').map(Number);
  var today = Date.UTC(p[0], p[1] - 1, p[2]);
  var dow = new Date(today).getUTCDay() || 7;              // Monday 1 ... Sunday 7
  var thu = new Date(today + (4 - dow) * 864e5);           // a week belongs to its Thursday
  var jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return {
    no: Math.ceil(((thu.getTime() - jan1) / 864e5 + 1) / 7),
    year: thu.getUTCFullYear(),
    from: new Date(today - (dow - 1) * 864e5),
    to: new Date(today)                                    // the week so far
  };
}

/* "5–9 Oct 2026", "28 Sep – 2 Oct 2026", "29 Dec 2026 – 1 Jan 2027". */
function wprSpan_(wk) {
  var f = function (d, pat) { return Utilities.formatDate(d, 'UTC', pat); };
  if (wk.from.getTime() === wk.to.getTime()) return f(wk.to, 'd MMM yyyy');
  if (f(wk.from, 'yyyy') !== f(wk.to, 'yyyy')) return f(wk.from, 'd MMM yyyy') + ' – ' + f(wk.to, 'd MMM yyyy');
  if (f(wk.from, 'M') !== f(wk.to, 'M')) return f(wk.from, 'd MMM') + ' – ' + f(wk.to, 'd MMM yyyy');
  return f(wk.from, 'd') + '–' + f(wk.to, 'd MMM yyyy');
}

/* TT$12,345.67 without leaning on locale support. */
function wprMoney_(x) {
  var n = Math.round((Number(x) || 0) * 100) / 100, s = Math.abs(n).toFixed(2);
  var i = s.indexOf('.');
  return (n < 0 ? '-' : '') + 'TT$' + s.slice(0, i).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + s.slice(i);
}

/* ── the sheet: the first sheet of the wall's download, to the column ─── */

function wprSheet_(S, footer) {
  var IND = ['', '   ', '      '];
  var t = S.total || {};
  var hasM = !!(t.m || S.rows.some(function (r) { return r.m; }));
  var wide = hasM ? 7 : 5, out = [];

  var banner = [{ v: 'SUBMITTED', s: 1 }];
  for (var k = 1; k < wide; k++) banner.push('');
  out.push(banner);
  var head = [{ v: 'Hierachy', s: 2 }, { v: 'Apps -W', s: 2 }, { v: 'API - W', s: 2 }];
  if (hasM) head.push({ v: 'Apps -MTD', s: 2 }, { v: 'API - MTD', s: 2 });
  head.push({ v: 'Apps -Y', s: 2 }, { v: 'API', s: 2 });
  out.push(head);

  /* Blank stays blank: an empty cell is no activity, a zero is a result. */
  function num(p, i, style) {
    var v = (p && p[i] !== null && p[i] !== undefined) ? p[i] : '';
    return { v: v, s: style };
  }
  S.rows.forEach(function (r) {
    var lab = r.lvl === 0 ? 3 : r.lvl === 1 ? 4 : 5;
    var ni = r.lvl === 2 ? 7 : 9, mi = r.lvl === 2 ? 8 : 10;
    var line = [{ v: IND[r.lvl] + r.label, s: lab }, num(r.w, 0, ni), num(r.w, 1, mi)];
    if (hasM) line.push(num(r.m, 0, ni), num(r.m, 1, mi));
    line.push(num(r.y, 0, ni), num(r.y, 1, mi));
    out.push(line);
  });
  var tot = [{ v: 'Total', s: 6 }, num(t.w, 0, 11), num(t.w, 1, 12)];
  if (hasM) tot.push(num(t.m, 0, 11), num(t.m, 1, 12));
  tot.push(num(t.y, 0, 11), num(t.y, 1, 12));
  out.push(tot);
  out.push([]);
  footer.forEach(function (line) { out.push([{ v: line, s: 0 }]); });
  return { name: 'Submitted', rows: out,
           /* A width wider than the wall's for the Apps columns: "Apps -MTD"
              clipped at 10 wherever Calibri is not installed. */
           cols: hasM ? [36, 11, 16, 11, 16, 11, 17] : [36, 11, 16, 11, 17],
           merges: [hasM ? 'A1:G1' : 'A1:E1'] };
}

/* Three short lines under the total, each inside the printed width. */
function wprFooter_(S, wk, now) {
  var periods = ['W is week ' + wk.no + ', ' + wprSpan_(wk)];
  if (S.monthLabel) periods.push('MTD is ' + S.monthLabel + ' to date');
  if (S.yearLabel && S.yearFrom) {
    var y = String(S.yearFrom).split('-').map(Number);
    periods.push('Y is ' + S.yearLabel + ', from ' +
                 Utilities.formatDate(new Date(Date.UTC(y[0], y[1] - 1, y[2])), 'UTC', 'd MMMM yyyy'));
  }
  return ['As at ' + Utilities.formatDate(now, WPR_TZ, 'EEEE d MMMM yyyy, h:mm a'),
          periods.join(' · '),
          'Production picked up, new business and increases, from Salesforce · CONFIDENTIAL'];
}

/* ── the .xlsx: the same parts and styles the wall writes ──────────────── */

function wprEsc_(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wprCol_(i) {
  var s = ''; i++;
  while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
  return s;
}

/* Style indices, as the wall numbers them:
     1 banner  2 header  3 unit  4 manager  5 agent  6 total
     7 int  8 money  9 int bold  10 money bold
   and two the wall does not have: 11 and 12, the total's numbers with
   thousands separators, because the total is the figure head office reads
   first and 245310.5 is harder to read than 245,310.50. */
function wprStyles_() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2">' +
    '<numFmt numFmtId="164" formatCode="#,##0"/>' +
    '<numFmt numFmtId="165" formatCode="#,##0.00"/>' +
  '</numFmts>' +
  '<fonts count="4">' +
    '<font><sz val="10"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF1F3B1F"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="5">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4E7A34"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8C9C9"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFDE9E9"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top style="thin"><color rgb="FF4E7A34"/></top><bottom style="double"><color rgb="FF4E7A34"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="13">' +
    '<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0"   fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0"   fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0"   fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0"   fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0"   fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="2" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="2" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';
}

/* The package parts, as text. [Content_Types].xml goes first. */
function wprParts_(sheets) {
  var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var parts = [];
  parts.push({ name: '[Content_Types].xml', data: X +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map(function (_, i) {
      return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
             '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join('') + '</Types>' });
  parts.push({ name: '_rels/.rels', data: X +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>' });
  parts.push({ name: 'xl/workbook.xml', data: X +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets.map(function (sh, i) {
      return '<sheet name="' + wprEsc_(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    }).join('') + '</sheets></workbook>' });
  parts.push({ name: 'xl/styles.xml', data: wprStyles_() });
  parts.push({ name: 'xl/_rels/workbook.xml.rels', data: X +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map(function (_, i) {
      return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
             'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    }).join('') +
    '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>' });
  sheets.forEach(function (sh, i) {
    var rows = sh.rows.map(function (r, ri) {
      var cells = r.map(function (v, ci) {
        var ref = wprCol_(ci) + (ri + 1), st = 0;
        if (v && typeof v === 'object') { st = v.s || 0; v = v.v; }
        var sa = st ? ' s="' + st + '"' : '';
        if (v === null || v === undefined || v === '') return sa ? '<c r="' + ref + '"' + sa + '/>' : '';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + wprEsc_(v) + '</t></is></c>';
      }).join('');
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');
    var cols = sh.cols ? '<cols>' + sh.cols.map(function (w, ci) {
      return '<col min="' + (ci + 1) + '" max="' + (ci + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('') + '</cols>' : '';
    var merges = sh.merges ? '<mergeCells count="' + sh.merges.length + '">' +
      sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '';
    parts.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: X +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      /* Printed, it fits the page's width in landscape, as many pages tall as it needs. */
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      cols + '<sheetData>' + rows + '</sheetData>' + merges +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>' });
  });
  return parts;
}

function wprXlsx_(sheet, fileName) {
  var blobs = wprParts_([sheet]).map(function (p) {
    return Utilities.newBlob(p.data, 'application/xml', p.name);
  });
  return Utilities.zip(blobs, fileName)
    .setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ── the email ─────────────────────────────────────────────────────────── */

function wprSubject_(wk, preview) {
  return (preview ? '[PREVIEW] ' : '') + 'Weekly Production — Ricky Rampersad Branch — Week ' +
         wk.no + ', ' + wprSpan_(wk);
}

function wprBody_(S, wk, now) {
  var t = S.total || {};
  var hour = Number(Utilities.formatDate(now, WPR_TZ, 'H'));
  var hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  var cell = 'padding:7px 12px;border-bottom:1px solid #E2E8F0;';
  function line(label, p, strong) {
    var w = strong ? 'font-weight:700;' : '';
    return '<tr><td style="' + cell + w + '">' + label + '</td>' +
      '<td style="' + cell + w + 'text-align:right">' + (p ? Number(p[0]) || 0 : 0) + '</td>' +
      '<td style="' + cell + w + 'text-align:right">' + wprMoney_(p ? p[1] : 0) + '</td></tr>';
  }
  var rows = line('This week, ' + wprSpan_(wk), t.w, true);
  if (t.m) rows += line((S.monthLabel || 'Month') + ' to date', t.m);
  rows += line((S.yearLabel || 'Year') + ' to date', t.y);
  return '<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#0F172A;max-width:620px">' +
    '<p style="margin:0 0 14px">' + hello + ',</p>' +
    '<p style="margin:0 0 16px">Attached is the production report for the <strong>Ricky Rampersad ' +
    'Branch</strong>, <strong>week ' + wk.no + '</strong> (' + wprSpan_(wk) + ').</p>' +
    '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:0 0 16px;min-width:360px">' +
    '<tr style="background:#4E7A34;color:#fff"><th style="padding:7px 12px;text-align:left">Branch</th>' +
    '<th style="padding:7px 12px;text-align:right">Apps</th><th style="padding:7px 12px;text-align:right">API</th></tr>' +
    rows + '</table>' +
    '<p style="margin:0 0 14px;color:#475569;font-size:13.5px">Production picked up: new business on its ' +
    'picked-up date and increases on theirs, from Salesforce. The sheet lists every advisor under their ' +
    'unit; a blank cell means nothing was picked up in that period.</p>' +
    '<p style="margin:0 0 14px;color:#475569;font-size:13.5px">Sent automatically on ' +
    Utilities.formatDate(now, WPR_TZ, 'EEEE d MMMM yyyy') + ' at ' + Utilities.formatDate(now, WPR_TZ, 'h:mm a') +
    '. For any query on the figures, reply to this email and it reaches the branch.</p>' +
    '<p style="margin:18px 0 0;color:#94A3B8;font-size:11.5px">Ricky Rampersad Branch · Guardian Life of ' +
    'the Caribbean Limited. This message contains confidential information intended only for the ' +
    'named recipients.</p></div>';
}

function wprCount_(list) {
  return String(list || '').split(',').filter(function (x) { return x.trim(); }).length;
}

function wprBranch_() {
  try { return String((MAIL_CONFIG && MAIL_CONFIG.branchManager) || '').trim(); } catch (e) { return ''; }
}

/* One send. how: 'friday' and 'retry' come from triggers, 'now' and
   'preview' from the editor. A preview goes to whoever runs it, alone. */
function wprSend_(how) {
  var now = new Date(), preview = how === 'preview';
  var me = Session.getEffectiveUser().getEmail();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return wprRecord_({ ok: false, how: how, why: 'Another send was already running.' });
  try {
    var wk = wprWeek_(now), key = wk.year + '-W' + wk.no;
    var props = PropertiesService.getScriptProperties();
    /* A second Friday trigger, or a retry after a send that did go, must not
       put the same week in head office's inbox twice. */
    if ((how === 'friday' || how === 'retry') && props.getProperty(WPR_SENT) === key) {
      return wprRecord_({ ok: true, how: how, skipped: true, why: 'Week ' + wk.no + ' was already sent.' });
    }
    var S = wprBoard_();
    var to = preview ? me : WPR_TO, cc = preview ? '' : WPR_CC;
    var bcc = (!preview && WPR_COPY_BRANCH) ? wprBranch_() : '';
    var need = wprCount_(to) + wprCount_(cc) + wprCount_(bcc), left = MailApp.getRemainingDailyQuota();
    if (left < need) throw new Error('Only ' + left + ' email(s) left in today\'s allowance; this needs ' + need + '.');
    var file = 'Weekly Production - Ricky Rampersad Branch - Week ' + wk.no + ' ' +
               Utilities.formatDate(now, WPR_TZ, 'yyyy-MM-dd') + '.xlsx';
    var msg = {
      to: to,
      subject: wprSubject_(wk, preview),
      htmlBody: wprBody_(S, wk, now),
      attachments: [wprXlsx_(wprSheet_(S, wprFooter_(S, wk, now)), file)],
      name: 'Ricky Rampersad Branch'
    };
    if (cc) msg.cc = cc;
    if (bcc) msg.bcc = bcc;
    if (!preview && wprBranch_()) msg.replyTo = wprBranch_();
    MailApp.sendEmail(msg);
    /* Only the scheduled sends mark the week. A wprSendNow on a Wednesday
       must not stop Friday's full week from going. */
    if (how === 'friday' || how === 'retry') props.setProperty(WPR_SENT, key);
    return wprRecord_({ ok: true, how: how, week: wk.no, subject: msg.subject, file: file,
                        to: to + (cc ? ' cc ' + cc : '') + (bcc ? ' bcc ' + bcc : ''),
                        rows: S.rows.length, total: S.total });
  } catch (err) {
    return wprRecord_({ ok: false, how: how, why: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function wprRecord_(r) {
  r.at = Utilities.formatDate(new Date(), WPR_TZ, 'EEE d MMM yyyy, h:mm a');
  try { PropertiesService.getScriptProperties().setProperty(WPR_LAST, JSON.stringify(r)); } catch (e) {}
  Logger.log((r.ok ? (r.skipped ? 'SKIPPED' : 'SENT') : 'NOT SENT') + ' (' + r.how + ')' +
             (r.subject ? '\n  subject : ' + r.subject : '') +
             (r.to ? '\n  to      : ' + r.to : '') +
             (r.file ? '\n  file    : ' + r.file + ', ' + r.rows + ' rows' : '') +
             (r.total && r.total.w ? '\n  week    : ' + (r.total.w[0] || 0) + ' apps, ' + wprMoney_(r.total.w[1]) : '') +
             (r.why ? '\n  why     : ' + r.why : ''));
  return r;
}

/* When Friday's send and its retry have both failed, the owner hears why.
   A report that silently stops is found out by head office, not the branch. */
function wprTellOwner_(r) {
  try {
    var me = Session.getEffectiveUser().getEmail();
    if (!me || MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail({
      to: me,
      subject: 'Weekly production report NOT sent',
      htmlBody: '<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#0F172A">' +
        '<p>This week\'s production report did not go to ' + wprEsc_(WPR_TO) + '.</p>' +
        '<p><strong>Why:</strong> ' + wprEsc_(r.why || 'unknown') + '</p>' +
        '<p>Fix that, then run <strong>wprSendNow</strong> in the RR Branch FF System project ' +
        'to send it.</p></div>',
      name: 'Ricky Rampersad Branch'
    });
  } catch (e) { Logger.log('Could not tell the owner: ' + (e && e.message)); }
}

/* ── triggers and the editor's buttons ─────────────────────────────────── */

function wprClear_(names) {
  var gone = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names.indexOf(t.getHandlerFunction()) > -1) { gone.push(t.getHandlerFunction()); ScriptApp.deleteTrigger(t); }
  });
  return gone;
}

/* The Friday trigger. One retry, half an hour later, if it fails. */
function wprFriday() {
  var r = wprSend_('friday');
  if (!r.ok) {
    wprClear_(['wprRetry']);
    ScriptApp.newTrigger('wprRetry').timeBased().after(30 * 60 * 1000).create();
  }
  return r;
}

function wprRetry() {
  wprClear_(['wprRetry']);
  var r = wprSend_('retry');
  if (!r.ok) wprTellOwner_(r);
  return r;
}

function wprPreview() { return wprSend_('preview'); }

function wprSendNow() { return wprSend_('now'); }

function wprSetup() {
  var gone = wprClear_(['wprFriday', 'wprRetry'].concat(WPR_OLD_TRIGGERS));
  ScriptApp.newTrigger('wprFriday').timeBased()
    .onWeekDay(ScriptApp.WeekDay[WPR_DAY]).atHour(WPR_HOUR).nearMinute(0)
    .inTimezone(WPR_TZ).create();
  var old = gone.filter(function (n) { return WPR_OLD_TRIGGERS.indexOf(n) > -1; });
  Logger.log('Weekly production report: every ' + WPR_DAY.charAt(0) + WPR_DAY.slice(1).toLowerCase() +
             ' at ' + WPR_HOUR + ':00, Port of Spain.' +
             '\n  to      : ' + WPR_TO + (WPR_CC ? '\n  cc      : ' + WPR_CC : '') +
             (WPR_COPY_BRANCH && wprBranch_() ? '\n  bcc     : ' + wprBranch_() : '') +
             (old.length ? '\n  removed : the September settled-sheet trigger(s): ' + old.join(', ') : '') +
             (typeof fyrBoard_ === 'function' ? '' :
              '\n  WARNING : FinancialYear.gs is not in this project. Nothing will send until it is.'));
}

function wprStop() {
  var gone = wprClear_(['wprFriday', 'wprRetry']);
  Logger.log(gone.length ? 'The Friday send is off.' : 'There was no Friday send to take off.');
}

function wprStatus() {
  var fns = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var last = PropertiesService.getScriptProperties().getProperty(WPR_LAST);
  var r = null;
  try { r = last ? JSON.parse(last) : null; } catch (e) {}
  var old = fns.filter(function (n) { return WPR_OLD_TRIGGERS.indexOf(n) > -1; });
  Logger.log('Friday send : ' + (fns.indexOf('wprFriday') > -1 ? 'ON, ' + WPR_DAY + ' ' + WPR_HOUR + ':00' : 'OFF - run wprSetup') +
             '\n  to       : ' + WPR_TO + (WPR_CC ? '   cc ' + WPR_CC : '') +
             '\n  FY27     : ' + (typeof fyrBoard_ === 'function' ? 'FinancialYear.gs is in' : 'FinancialYear.gs is MISSING - nothing will send') +
             (old.length ? '\n  old      : the September trigger is still there (' + old.join(', ') + '). wprSetup removes it.' : '') +
             '\n  email left today : ' + MailApp.getRemainingDailyQuota() +
             '\n  last run : ' + (r ? r.at + ', ' + r.how + ', ' + (r.ok ? (r.skipped ? 'skipped' : 'sent') : 'NOT SENT: ' + r.why) : 'none yet'));
}
