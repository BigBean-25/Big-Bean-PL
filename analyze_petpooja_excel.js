import ExcelJS from 'exceljs';

const analyzePetPoojaExcel = async () => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('D:/Big Bean Consmption/Outlet-Item_Wise_Report_(Row)_2026_05_27_01_43_06.xlsx');
    
    console.log('=== PETPOOJA EXCEL ANALYSIS ===\n');
    
    // Get all worksheets
    console.log('Number of worksheets:', workbook.worksheets.length);
    workbook.worksheets.forEach((worksheet, index) => {
      console.log(`\nWorksheet ${index + 1}: ${worksheet.name}`);
    });
    
    // Analyze first worksheet
    const worksheet = workbook.getWorksheet(1);
    console.log('\n=== FIRST WORKSHEET DETAILS ===');
    console.log('Name:', worksheet.name);
    console.log('Row Count:', worksheet.rowCount);
    console.log('Column Count:', worksheet.columnCount);
    
    // Get headers (first row)
    console.log('\n=== COLUMN HEADERS ===');
    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers.push({ col: colNumber, header: cell.value });
      console.log(`Column ${colNumber}: ${cell.value}`);
    });
    
    // Get first 5 data rows as sample
    console.log('\n=== SAMPLE DATA (First 5 rows) ===');
    for (let i = 2; i <= Math.min(6, worksheet.rowCount); i++) {
      const row = worksheet.getRow(i);
      console.log(`\nRow ${i}:`);
      row.eachCell((cell, colNumber) => {
        console.log(`  ${headers[colNumber - 1]?.header}: ${cell.value}`);
      });
    }
    
    // Analyze data types
    console.log('\n=== DATA TYPE ANALYSIS ===');
    const row2 = worksheet.getRow(2);
    row2.eachCell((cell, colNumber) => {
      console.log(`${headers[colNumber - 1]?.header}: ${typeof cell.value} - ${cell.value}`);
    });
    
  } catch (error) {
    console.error('Error analyzing Excel:', error);
  }
};

analyzePetPoojaExcel();
