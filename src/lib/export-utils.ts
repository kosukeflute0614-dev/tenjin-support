/**
 * JSON配列をCSV文字列に変換し、ブラウザでダウンロードさせます。
 * @param data エクスポートするデータの配列
 * @param filename 保存時のファイル名
 * @param headers CSVのヘッダー行（指定しない場合はオブジェクトのキーを使用）
 */
export function exportToCSV(data: any[], filename: string, headers?: { key: string, label: string }[]) {
    if (!data || data.length === 0) return;

    const columnHeaders = headers || Object.keys(data[0]).map(key => ({ key, label: key }));

    const csvRows = [];

    // ヘッダー行
    csvRows.push(columnHeaders.map(h => `"${h.label.replace(/"/g, '""')}"`).join(','));

    // データ行
    for (const row of data) {
        const values = columnHeaders.map(h => {
            const val = row[h.key];
            const escaped = ('' + (val ?? '')).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    }

    const csvString = '\uFEFF' + csvRows.join('\n'); // Add BOM for Excel compatibility
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
