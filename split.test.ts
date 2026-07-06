import { PDFDocument, PageSizes } from "pdf-lib";
import { DocumentService } from "../services/document.service.js";
import JSZip from "jszip";

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
  console.log("🚀 NIKPDF V2 AUTOMATED SPLIT PDF TESTS");
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
    // ----------------------------------------------------
    // TEST 1: Split every page
    // ----------------------------------------------------
    console.log("Running Test 1: Split every page...");
    const pdf1 = await generateTestPdf(5); // 5 pages
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "split-pdf", { splitMode: "all" });
    assert(res1.success === true, "Split every page response success status is true");
    assert(res1.outputName === "doc1_every_page.zip", `Output filename is correct: ${res1.outputName}`);
    
    // Load ZIP and inspect contents
    const savedJob1 = DocumentService.getJob(res1.jobId)!;
    const zip1 = await JSZip.loadAsync(savedJob1.buffer);
    const filesInZip1 = Object.keys(zip1.files);
    assert(filesInZip1.length === 5, `Expected 5 files inside zip, got ${filesInZip1.length}`);
    assert(filesInZip1.includes("doc1_Page_01.pdf"), "Contains page 01 PDF");
    assert(filesInZip1.includes("doc1_Page_05.pdf"), "Contains page 05 PDF");

    const p1Bytes = await zip1.file("doc1_Page_01.pdf")!.async("nodebuffer");
    const p1Doc = await PDFDocument.load(p1Bytes);
    assert(p1Doc.getPageCount() === 1, "Page 1 document has exactly 1 page");

    // ----------------------------------------------------
    // TEST 2: Split by page range (single range, single file)
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Split by page range (single range -> single PDF)...");
    const res2 = await DocumentService.process(files1, "split-pdf", { splitMode: "ranges", ranges: "2-4" });
    assert(res2.success === true, "Split by single range response success status is true");
    assert(res2.outputName === "doc1_Pages_2-4.pdf", `Output filename is correct: ${res2.outputName}`);

    const savedJob2 = DocumentService.getJob(res2.jobId)!;
    const doc2 = await PDFDocument.load(savedJob2.buffer);
    assert(doc2.getPageCount() === 3, `Expected 3 pages in output, got ${doc2.getPageCount()}`);

    // ----------------------------------------------------
    // TEST 3: Split by page ranges (multiple ranges -> ZIP)
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Split by page ranges (multiple ranges -> ZIP)...");
    const res3 = await DocumentService.process(files1, "split-pdf", { splitMode: "ranges", ranges: "1-2, 4-5" });
    assert(res3.success === true, "Split by multiple ranges response success status is true");
    assert(res3.outputName === "doc1_ranges.zip", `Output filename is correct: ${res3.outputName}`);

    const savedJob3 = DocumentService.getJob(res3.jobId)!;
    const zip3 = await JSZip.loadAsync(savedJob3.buffer);
    const filesInZip3 = Object.keys(zip3.files);
    assert(filesInZip3.length === 2, `Expected 2 files in ZIP, got ${filesInZip3.length}`);
    assert(filesInZip3.includes("doc1_Range_1-2.pdf"), "ZIP contains range 1-2");
    assert(filesInZip3.includes("doc1_Range_4-5.pdf"), "ZIP contains range 4-5");

    const r1Bytes = await zip3.file("doc1_Range_1-2.pdf")!.async("nodebuffer");
    const r1Doc = await PDFDocument.load(r1Bytes);
    assert(r1Doc.getPageCount() === 2, `Expected 2 pages in range 1-2, got ${r1Doc.getPageCount()}`);

    // ----------------------------------------------------
    // TEST 4: Extract selected pages
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Extract selected pages...");
    const res4 = await DocumentService.process(files1, "split-pdf", { splitMode: "extract", selectedPages: "1,3,5" });
    assert(res4.success === true, "Extract selected pages response success status is true");
    assert(res4.outputName === "doc1_extracted.pdf", `Output filename is correct: ${res4.outputName}`);

    const savedJob4 = DocumentService.getJob(res4.jobId)!;
    const doc4 = await PDFDocument.load(savedJob4.buffer);
    assert(doc4.getPageCount() === 3, `Expected 3 pages in extracted document, got ${doc4.getPageCount()}`);

    // ----------------------------------------------------
    // TEST 5: Split every N pages
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Split every N pages (every 2 pages)...");
    const res5 = await DocumentService.process(files1, "split-pdf", { splitMode: "every_n", everyN: 2 });
    assert(res5.success === true, "Split every N pages response success status is true");
    assert(res5.outputName === "doc1_every_2_pages.zip", `Output filename is correct: ${res5.outputName}`);

    const savedJob5 = DocumentService.getJob(res5.jobId)!;
    const zip5 = await JSZip.loadAsync(savedJob5.buffer);
    const filesInZip5 = Object.keys(zip5.files);
    assert(filesInZip5.length === 3, `Expected 3 segment files, got ${filesInZip5.length}`);
    assert(filesInZip5.includes("doc1_Part_1_Pages_1-2.pdf"), "Contains segment 1 (pages 1-2)");
    assert(filesInZip5.includes("doc1_Part_2_Pages_3-4.pdf"), "Contains segment 2 (pages 3-4)");
    assert(filesInZip5.includes("doc1_Part_3_Pages_5-5.pdf"), "Contains segment 3 (pages 5-5)");

    const part3Bytes = await zip5.file("doc1_Part_3_Pages_5-5.pdf")!.async("nodebuffer");
    const part3Doc = await PDFDocument.load(part3Bytes);
    assert(part3Doc.getPageCount() === 1, `Expected part 3 to have 1 page, got ${part3Doc.getPageCount()}`);

    // ----------------------------------------------------
    // TEST 6: Validation & Error Handling - Invalid Page Range
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Page Range Validation (exceeding page limit)...");
    try {
      await DocumentService.process(files1, "split-pdf", { splitMode: "ranges", ranges: "1-10" });
      assert(false, "Should have thrown an error for range exceeding total pages");
    } catch (err: any) {
      assert(
        err.message.includes("exceeds total document pages"),
        `Correctly threw error for exceeding pages: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 7: Page Range Validation - Invalid start > end
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Page Range Validation (start page > end page)...");
    try {
      await DocumentService.process(files1, "split-pdf", { splitMode: "ranges", ranges: "5-3" });
      assert(false, "Should have thrown an error for start > end");
    } catch (err: any) {
      assert(
        err.message.includes("cannot be greater than end page"),
        `Correctly threw error: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 8: Page Range Validation - Invalid numbers/characters
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Page Range Validation (invalid formats)...");
    try {
      await DocumentService.process(files1, "split-pdf", { splitMode: "ranges", ranges: "abc-def" });
      assert(false, "Should have thrown error for non-numeric input");
    } catch (err: any) {
      assert(
        err.message.includes("Invalid numbers in range") || err.message.includes("Invalid page number"),
        `Correctly threw error for non-numeric input: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 9: Password-protected PDF rejection
    // ----------------------------------------------------
    console.log("\nRunning Test 9: Rejection of password-protected files...");
    const encryptedBuffer = Buffer.from(
      "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
      "4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (12345) /U (12345) /P -4 >>\nendobj\n" + // Encrypt dict
      "trailer\n<< /Root 1 0 R /Encrypt 4 0 R >>\n" +
      "%%EOF"
    );
    const files9 = [createMockMulterFile("protected.pdf", encryptedBuffer)];
    try {
      await DocumentService.process(files9, "split-pdf", { splitMode: "all" });
      assert(false, "Should have thrown an error for encrypted file");
    } catch (err: any) {
      assert(
        err.message.includes("password-protected") || err.message.includes("encrypted"),
        `Correctly rejected encrypted file with error message: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 10: Corrupted PDF rejection
    // ----------------------------------------------------
    console.log("\nRunning Test 10: Rejection of corrupted files...");
    const corruptBuffer = Buffer.from("%PDF-1.4\nthis is some totally corrupted garbage context%%EOF");
    const files10 = [createMockMulterFile("corrupt.pdf", corruptBuffer)];
    try {
      await DocumentService.process(files10, "split-pdf", { splitMode: "all" });
      assert(false, "Should have thrown an error for corrupt file");
    } catch (err: any) {
      assert(
        err.message.includes("corrupted") || err.message.includes("Failed to process") || err.message.includes("invalid") || err.message.includes("Cannot read properties"),
        `Correctly rejected corrupted file with error message: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 11: Page extraction checks - Landscape, Mixed sizes
    // ----------------------------------------------------
    console.log("\nRunning Test 11: Preserving Page Sizes & Orientation...");
    const portraitPdf = await generateTestPdf(1, { size: [400, 600] });
    const landscapePdf = await generateTestPdf(1, { landscape: true });
    
    // Merge them first so we have a 2-page document with mixed pages
    const mergedPdf = await PDFDocument.create();
    const p1 = await PDFDocument.load(portraitPdf);
    const p2 = await PDFDocument.load(landscapePdf);
    const copied1 = await mergedPdf.copyPages(p1, [0]);
    const copied2 = await mergedPdf.copyPages(p2, [0]);
    mergedPdf.addPage(copied1[0]);
    mergedPdf.addPage(copied2[0]);
    const mixedBuffer = Buffer.from(await mergedPdf.save());

    const files11 = [createMockMulterFile("mixed.pdf", mixedBuffer)];
    const res11 = await DocumentService.process(files11, "split-pdf", { splitMode: "ranges", ranges: "1-2" });
    const savedJob11 = DocumentService.getJob(res11.jobId)!;
    const doc11 = await PDFDocument.load(savedJob11.buffer);
    const page0 = doc11.getPage(0);
    const page1 = doc11.getPage(1);
    assert(page0.getWidth() === 400 && page0.getHeight() === 600, "Portrait page dimensions intact");
    assert(page1.getWidth() === 842 && page1.getHeight() === 595, "Landscape page dimensions intact");

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
