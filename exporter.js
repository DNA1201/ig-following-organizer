/**
 * Export utilities:
 * 1. UTF-8 BOM CSV (opens cleanly in Excel with Chinese characters)
 * 2. Excel SpreadsheetML (.xls) with clickable Instagram links
 * 3. JSON backup for cross-device progress sync (PC <-> Mobile)
 */

const DECISION_LABELS = {
  undecided: '未決定',
  keep: '保留',
  mute: '靜音',
  unfollow: '考慮取消',
  later: '稍後再看'
};

function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function xmlEscape(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function timestampSuffix() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function exportToCSV(accounts, filterLabel = 'all') {
  const headers = ['帳號', 'IG 連結', '關係', '決定', '追蹤日期', '輔助特徵標籤', '備註'];
  const rows = accounts.map((acc) => [
    acc.username,
    acc.href,
    acc.isMutual ? '互追' : '單方面追蹤',
    DECISION_LABELS[acc.decision] || acc.decision,
    formatDate(acc.followedAt),
    (acc.hints || []).join(' / '),
    acc.note || ''
  ]);

  const csvBody = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `ig-following-${filterLabel}-${timestampSuffix()}.csv`);
}

export function exportToExcel(accounts, filterLabel = 'all') {
  const headers = ['帳號', 'IG 個人頁面連結', '關係', '決定', '追蹤日期', '輔助特徵標籤', '備註'];

  const headerCells = headers
    .map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`)
    .join('');

  const dataRows = accounts
    .map((acc) => {
      const cells = [
        `<Cell><Data ss:Type="String">@${xmlEscape(acc.username)}</Data></Cell>`,
        `<Cell ss:StyleID="Link" ss:HRef="${xmlEscape(acc.href)}"><Data ss:Type="String">${xmlEscape(acc.href)}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${acc.isMutual ? '互追' : '單方面追蹤'}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${xmlEscape(DECISION_LABELS[acc.decision] || acc.decision)}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${formatDate(acc.followedAt)}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${xmlEscape((acc.hints || []).join(' / '))}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${xmlEscape(acc.note || '')}</Data></Cell>`
      ].join('');
      return `<Row>${cells}</Row>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Link">
      <Font ss:Color="#2563EB" ss:Underline="Single"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="IG追蹤整理清單">
    <Table>
      <Column ss:Width="150"/>
      <Column ss:Width="260"/>
      <Column ss:Width="90"/>
      <Column ss:Width="90"/>
      <Column ss:Width="95"/>
      <Column ss:Width="200"/>
      <Column ss:Width="200"/>
      <Row>${headerCells}</Row>
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, `ig-following-${filterLabel}-${timestampSuffix()}.xls`);
}

export function exportProgressBackup(state) {
  const payload = {
    schema: 'ig-following-organizer-backup-v1',
    exportedAt: Date.now(),
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, `ig-organizer-backup-${timestampSuffix()}.json`);
}
