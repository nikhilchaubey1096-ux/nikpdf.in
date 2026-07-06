import { PDFDocument, PageSizes } from "pdf-lib";
import { DocumentService } from "../services/document.service.js";

// Helper to create a dummy Express Multer File
function createMockMulterFile(name: string, buffer: Buffer, mimetype = "application/pdf"): Express.Multer.File {
  return {
    fieldname: "files",
    originalname: name,
    encoding: "7bit",
    mimetype,
    buffer,
    size: buffer.length,
    stream: null as any,
    destination: "",
    filename: "",
    path: "",
  };
}

async function runTests() {
  console.log("========================================");
  console.log("🚀 NIKPDF V2 AUTOMATED INTEGRATION TESTS");
  console.log("========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(` ✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(` ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Helper to generate a valid PDF buffer with specific properties
  async function generateTestPdf(pagesCount: number, options: { landscape?: boolean; size?: [number, number] } = {}) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pagesCount; i++) {
      const page = pdfDoc.addPage(options.size || PageSizes.A4);
      if (options.landscape) {
        page.setSize(842, 595); // Standard A4 Landscape
      }
    }
    return Buffer.from(await pdfDoc.save());
  }

  try {
    // TEST 1: Merge 2 PDFs
    console.log("Running Test 1: Merging 2 PDFs...");
    const pdf1 = await generateTestPdf(2); // 2 pages
    const pdf2 = await generateTestPdf(3); // 3 pages
    const files1 = [
      createMockMulterFile("doc1.pdf", pdf1),
      createMockMulterFile("doc2.pdf", pdf2),
    ];

    const res1 = await DocumentService.process(files1, "merge-pdf");
    assert(res1.success === true, "Merge 2 PDFs response success status is true");
    const mergedDoc1 = await PDFDocument.load(DocumentService.getJob(res1.jobId)!.buffer);
    assert(mergedDoc1.getPageCount() === 5, `Expected 5 pages in merged PDF, got ${mergedDoc1.getPageCount()}`);

    // TEST 2: Merge 5 PDFs
    console.log("\nRunning Test 2: Merging 5 PDFs...");
    const files2 = [];
    for (let i = 1; i <= 5; i++) {
      const pdf = await generateTestPdf(1);
      files2.push(createMockMulterFile(`file_${i}.pdf`, pdf));
    }
    const res2 = await DocumentService.process(files2, "merge-pdf");
    assert(res2.success === true, "Merge 5 PDFs response success status is true");
    const mergedDoc2 = await PDFDocument.load(DocumentService.getJob(res2.jobId)!.buffer);
    assert(mergedDoc2.getPageCount() === 5, `Expected 5 pages in merged PDF, got ${mergedDoc2.getPageCount()}`);

    // TEST 3: Merge 10 PDFs
    console.log("\nRunning Test 3: Merging 10 PDFs...");
    const files3_10 = [];
    for (let i = 1; i <= 10; i++) {
      const pdf = await generateTestPdf(1);
      files3_10.push(createMockMulterFile(`file_${i}.pdf`, pdf));
    }
    const res3_10 = await DocumentService.process(files3_10, "merge-pdf");
    assert(res3_10.success === true, "Merge 10 PDFs response success status is true");
    const mergedDoc3_10 = await PDFDocument.load(DocumentService.getJob(res3_10.jobId)!.buffer);
    assert(mergedDoc3_10.getPageCount() === 10, `Expected 10 pages in merged PDF, got ${mergedDoc3_10.getPageCount()}`);

    // TEST 3B: Merge 50 PDFs (High volume)
    console.log("\nRunning Test 3B: Merging 50 PDFs...");
    const files3_50 = [];
    for (let i = 1; i <= 50; i++) {
      const pdf = await generateTestPdf(1);
      files3_50.push(createMockMulterFile(`file_${i}.pdf`, pdf));
    }
    const res3_50 = await DocumentService.process(files3_50, "merge-pdf");
    assert(res3_50.success === true, "Merge 50 PDFs response success status is true");
    const mergedDoc3_50 = await PDFDocument.load(DocumentService.getJob(res3_50.jobId)!.buffer);
    assert(mergedDoc3_50.getPageCount() === 50, `Expected 50 pages in merged PDF, got ${mergedDoc3_50.getPageCount()}`);

    // TEST 4: Portrait + Landscape & Mixed page sizes
    console.log("\nRunning Test 4: Mixed page sizes and orientation...");
    const portraitPdf = await generateTestPdf(1, { size: [400, 600] });
    const landscapePdf = await generateTestPdf(1, { landscape: true });
    const files4 = [
      createMockMulterFile("portrait.pdf", portraitPdf),
      createMockMulterFile("landscape.pdf", landscapePdf),
    ];
    const res4 = await DocumentService.process(files4, "merge-pdf");
    assert(res4.success === true, "Merged mixed sizes successfully");
    const mergedDoc4 = await PDFDocument.load(DocumentService.getJob(res4.jobId)!.buffer);
    const page0 = mergedDoc4.getPage(0);
    const page1 = mergedDoc4.getPage(1);
    assert(page0.getWidth() === 400 && page0.getHeight() === 600, "Portrait dimensions maintained");
    assert(page1.getWidth() === 842 && page1.getHeight() === 595, "Landscape dimensions maintained");

    // TEST 5: Password-protected PDF rejection
    console.log("\nRunning Test 5: Rejection of password-protected files...");
    // Create an encrypted PDF structure (minimal representation to trigger encryption loading error)
    const encryptedBuffer = Buffer.from(
      "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
      "4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (12345) /U (12345) /P -4 >>\nendobj\n" + // Encrypt dict
      "trailer\n<< /Root 1 0 R /Encrypt 4 0 R >>\n" +
      "%%EOF"
    );
    const files5 = [
      createMockMulterFile("normal.pdf", await generateTestPdf(1)),
      createMockMulterFile("protected.pdf", encryptedBuffer),
    ];
    try {
      await DocumentService.process(files5, "merge-pdf");
      assert(false, "Should have thrown an error for encrypted file");
    } catch (err: any) {
      assert(
        err.message.includes("password-protected") || err.message.includes("encrypted"),
        `Correctly rejected encrypted file with error message: "${err.message}"`
      );
    }

    // TEST 6: Corrupted PDF rejection
    console.log("\nRunning Test 6: Rejection of corrupted files...");
    const corruptBuffer = Buffer.from("%PDF-1.4\nthis is some totally corrupted garbage context%%EOF");
    const files6 = [
      createMockMulterFile("normal.pdf", await generateTestPdf(1)),
      createMockMulterFile("corrupt.pdf", corruptBuffer),
    ];
    try {
      await DocumentService.process(files6, "merge-pdf");
      assert(false, "Should have thrown an error for corrupt file");
    } catch (err: any) {
      assert(
        err.message.includes("corrupted") || err.message.includes("Failed to process"),
        `Correctly rejected corrupted file with error message: "${err.message}"`
      );
    }

    // TEST 7: Empty PDF rejection
    console.log("\nRunning Test 7: Rejection of empty files...");
    const emptyBuffer = Buffer.from("");
    const files7 = [
      createMockMulterFile("normal.pdf", await generateTestPdf(1)),
      createMockMulterFile("empty.pdf", emptyBuffer),
    ];
    try {
      await DocumentService.process(files7, "merge-pdf");
      assert(false, "Should have thrown an error for empty file");
    } catch (err: any) {
      assert(
        err.message.includes("empty"),
        `Correctly rejected empty file with error: "${err.message}"`
      );
    }

    // TEST 8: Non-PDF rejection
    console.log("\nRunning Test 8: Rejection of unsupported file types...");
    const imageBuffer = Buffer.from("DUMMY_IMAGE_BYTES");
    const files8 = [
      createMockMulterFile("normal.pdf", await generateTestPdf(1)),
      createMockMulterFile("image.png", imageBuffer, "image/png"),
    ];
    try {
      await DocumentService.process(files8, "merge-pdf");
      assert(false, "Should have thrown an error for unsupported file type");
    } catch (err: any) {
      assert(
        err.message.includes("Unsupported file type"),
        `Correctly rejected non-PDF files with error: "${err.message}"`
      );
    }

    // TEST 9: High payload test (e.g. 100MB simulation)
    console.log("\nRunning Test 9: Loading high page count scaling (large payload simulation)...");
    // Generate a file with 150 pages to check performance
    const largePdf = await generateTestPdf(150);
    const files9 = [
      createMockMulterFile("doc1.pdf", largePdf),
      createMockMulterFile("doc2.pdf", await generateTestPdf(1)),
    ];
    const startTime = Date.now();
    const res9 = await DocumentService.process(files9, "merge-pdf");
    const duration = Date.now() - startTime;
    assert(res9.success === true, `Successfully processed large file in ${duration}ms`);
    const mergedDoc9 = await PDFDocument.load(DocumentService.getJob(res9.jobId)!.buffer);
    assert(mergedDoc9.getPageCount() === 151, "Verified 151 pages correct output");

  } catch (err: any) {
    console.error("Test execution failed with critical error: ", err);
    failed++;
  }

  console.log("\n========================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("========================================\n");
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
