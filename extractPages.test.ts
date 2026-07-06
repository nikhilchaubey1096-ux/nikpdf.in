import { PDFDocument, PageSizes } from "pdf-lib";
import { DocumentService } from "../services/document.service.js";

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
  console.log("=================================================");
  console.log("🚀 NIKPDF V2 AUTOMATED EXTRACT PDF PAGES TESTS");
  console.log("=================================================\n");

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

  async function generateTestPdf(pagesCount: number, options?: { landscapeIndices?: number[] }) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pagesCount; i++) {
      const isLandscape = options?.landscapeIndices?.includes(i);
      const page = pdfDoc.addPage(isLandscape ? [PageSizes.A4[1], PageSizes.A4[0]] as [number, number] : PageSizes.A4);
      // Let's add some text to identify page numbers
      page.drawText(`Page ${i + 1}`);
    }
    return Buffer.from(await pdfDoc.save());
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Single Page Extract
    // ----------------------------------------------------
    console.log("Running Test 1: Single page extraction (Page 2 of 3)...");
    const pdf1 = await generateTestPdf(3);
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "extract-pages", { extractMode: "selected", pages: "2" });
    assert(res1.success === true, "Single page extraction response success status is true");
    assert(res1.outputName === "doc1_extracted.pdf", `Output filename is correct: ${res1.outputName}`);

    const savedJob1 = DocumentService.getJob(res1.jobId)!;
    const doc1 = await PDFDocument.load(savedJob1.buffer);
    assert(doc1.getPageCount() === 1, "Output document has exactly 1 page");

    // ----------------------------------------------------
    // TEST 2: Multiple pages extract (reordered list in input, but preserves original order)
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Multiple page extraction (Pages 3 and 1)...");
    const res2 = await DocumentService.process(files1, "extract-pages", { extractMode: "selected", pages: "3,1" });
    assert(res2.success === true, "Multiple page extraction response success status is true");
    const savedJob2 = DocumentService.getJob(res2.jobId)!;
    const doc2 = await PDFDocument.load(savedJob2.buffer);
    assert(doc2.getPageCount() === 2, "Output document has exactly 2 pages");

    // ----------------------------------------------------
    // TEST 3: Page range extraction
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Page range extraction (Pages 2-4 of 5)...");
    const pdf3 = await generateTestPdf(5);
    const files3 = [createMockMulterFile("doc3.pdf", pdf3)];
    const res3 = await DocumentService.process(files3, "extract-pages", { extractMode: "selected", pages: "2-4" });
    assert(res3.success === true, "Page range extraction response success status is true");
    const savedJob3 = DocumentService.getJob(res3.jobId)!;
    const doc3 = await PDFDocument.load(savedJob3.buffer);
    assert(doc3.getPageCount() === 3, "Output document has exactly 3 pages (Pages 2, 3, 4)");

    // ----------------------------------------------------
    // TEST 4: Extract Odd Pages
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Extract Odd Pages (1, 3, 5 of 5)...");
    const res4 = await DocumentService.process(files3, "extract-pages", { extractMode: "odd" });
    assert(res4.success === true, "Extract odd pages response success is true");
    const savedJob4 = DocumentService.getJob(res4.jobId)!;
    const doc4 = await PDFDocument.load(savedJob4.buffer);
    assert(doc4.getPageCount() === 3, "Output document has exactly 3 pages (Odd pages 1, 3, 5)");

    // ----------------------------------------------------
    // TEST 5: Extract Even Pages
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Extract Even Pages (2, 4 of 5)...");
    const res5 = await DocumentService.process(files3, "extract-pages", { extractMode: "even" });
    assert(res5.success === true, "Extract even pages response success is true");
    const savedJob5 = DocumentService.getJob(res5.jobId)!;
    const doc5 = await PDFDocument.load(savedJob5.buffer);
    assert(doc5.getPageCount() === 2, "Output document has exactly 2 pages (Even pages 2, 4)");

    // ----------------------------------------------------
    // TEST 6: Extract First / Last Page
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Extract First Page and Last Page individually...");
    const res6First = await DocumentService.process(files3, "extract-pages", { extractMode: "first" });
    const doc6First = await PDFDocument.load(DocumentService.getJob(res6First.jobId)!.buffer);
    assert(doc6First.getPageCount() === 1, "Extracted pages count is 1 after extracting first page");

    const res6Last = await DocumentService.process(files3, "extract-pages", { extractMode: "last" });
    const doc6Last = await PDFDocument.load(DocumentService.getJob(res6Last.jobId)!.buffer);
    assert(doc6Last.getPageCount() === 1, "Extracted pages count is 1 after extracting last page");

    // ----------------------------------------------------
    // TEST 7: Large PDF files (100-page & 500-page)
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Large PDFs (100 pages and 500 pages) extraction testing...");
    const pdf100 = await generateTestPdf(100);
    const files100 = [createMockMulterFile("doc100.pdf", pdf100)];
    const res100 = await DocumentService.process(files100, "extract-pages", { extractMode: "selected", pages: "10-90" });
    const doc100 = await PDFDocument.load(DocumentService.getJob(res100.jobId)!.buffer);
    assert(doc100.getPageCount() === 81, "Extracted pages count is 81 (from page 10 to 90)");

    const pdf500 = await generateTestPdf(500);
    const files500 = [createMockMulterFile("doc500.pdf", pdf500)];
    const res500 = await DocumentService.process(files500, "extract-pages", { extractMode: "selected", pages: "500" });
    const doc500 = await PDFDocument.load(DocumentService.getJob(res500.jobId)!.buffer);
    assert(doc500.getPageCount() === 1, "Extracted pages count is exactly 1 page (the 500th page)");

    // ----------------------------------------------------
    // TEST 8: Landscape & Portrait Mix Preservation
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Mix of Landscape & Portrait PDFs preservation...");
    const pdfMix = await generateTestPdf(3, { landscapeIndices: [1] }); // Page 2 is landscape
    const filesMix = [createMockMulterFile("docMix.pdf", pdfMix)];
    const resMix = await DocumentService.process(filesMix, "extract-pages", { extractMode: "selected", pages: "2" }); // Extract Page 2
    const docMix = await PDFDocument.load(DocumentService.getJob(resMix.jobId)!.buffer);
    assert(docMix.getPageCount() === 1, "Has extracted page 2");
    const page1Size = docMix.getPage(0).getSize();
    assert(page1Size.width > page1Size.height, "Extracted page maintains its Landscape orientation!");

    // ----------------------------------------------------
    // TEST 9: Invalid/Corrupted PDF Rejection
    // ----------------------------------------------------
    console.log("\nRunning Test 9: Corrupted PDF and Password-Protected PDF Rejection...");
    const corruptBuffer = Buffer.from("%PDF-1.4\nsome corrupted file stuff");
    try {
      await DocumentService.process([createMockMulterFile("corrupt.pdf", corruptBuffer)], "extract-pages", { extractMode: "odd" });
      assert(false, "Should have rejected corrupted file");
    } catch (err: any) {
      assert(
        err.message.includes("corrupted") || err.message.includes("invalid"),
        `Correctly rejected corrupted file with error: "${err.message}"`
      );
    }

    const encryptedBuffer = Buffer.from(
      "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
      "4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (12345) /U (12345) /P -4 >>\nendobj\n" +
      "trailer\n<< /Root 1 0 R /Encrypt 4 0 R >>\n" +
      "%%EOF"
    );
    try {
      await DocumentService.process([createMockMulterFile("protected.pdf", encryptedBuffer)], "extract-pages", { extractMode: "first" });
      assert(false, "Should have rejected encrypted file");
    } catch (err: any) {
      assert(
        err.message.includes("password-protected") || err.message.includes("encrypted"),
        `Correctly rejected password-protected file with error: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 10: Out of range validation
    // ----------------------------------------------------
    console.log("\nRunning Test 10: Page numbers out of range validation...");
    try {
      await DocumentService.process(files1, "extract-pages", { extractMode: "selected", pages: "4" });
      assert(false, "Should have rejected page 4 out of 3 total");
    } catch (err: any) {
      assert(
        err.message.includes("Invalid page number") || err.message.includes("between 1 and"),
        `Correctly rejected page number out of bounds: "${err.message}"`
      );
    }

  } catch (err: any) {
    console.error("Test execution failed with critical error: ", err);
    failed++;
  }

  console.log("\n=========================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("=========================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
