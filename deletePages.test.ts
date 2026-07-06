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
  console.log("🚀 NIKPDF V2 AUTOMATED DELETE PDF PAGES TESTS");
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
    // TEST 1: Single Page Delete
    // ----------------------------------------------------
    console.log("Running Test 1: Single page delete (Page 2 of 3)...");
    const pdf1 = await generateTestPdf(3);
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "delete-pages", { deleteMode: "selected", pages: "2" });
    assert(res1.success === true, "Single page delete response success status is true");
    assert(res1.outputName === "doc1_pages_deleted.pdf", `Output filename is correct: ${res1.outputName}`);

    const savedJob1 = DocumentService.getJob(res1.jobId)!;
    const doc1 = await PDFDocument.load(savedJob1.buffer);
    assert(doc1.getPageCount() === 2, "Output document has exactly 2 pages");

    // ----------------------------------------------------
    // TEST 2: Multiple pages delete
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Multiple page delete (Pages 1 and 3)...");
    const res2 = await DocumentService.process(files1, "delete-pages", { deleteMode: "selected", pages: "1,3" });
    assert(res2.success === true, "Multiple page delete response success status is true");
    const savedJob2 = DocumentService.getJob(res2.jobId)!;
    const doc2 = await PDFDocument.load(savedJob2.buffer);
    assert(doc2.getPageCount() === 1, "Output document has exactly 1 page");

    // ----------------------------------------------------
    // TEST 3: Page range delete
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Page range delete (Pages 2-4 of 5)...");
    const pdf3 = await generateTestPdf(5);
    const files3 = [createMockMulterFile("doc3.pdf", pdf3)];
    const res3 = await DocumentService.process(files3, "delete-pages", { deleteMode: "selected", pages: "2-4" });
    assert(res3.success === true, "Page range delete response success status is true");
    const savedJob3 = DocumentService.getJob(res3.jobId)!;
    const doc3 = await PDFDocument.load(savedJob3.buffer);
    assert(doc3.getPageCount() === 2, "Output document has exactly 2 pages left (Pages 1 and 5)");

    // ----------------------------------------------------
    // TEST 4: Delete Odd Pages
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Delete Odd Pages (1, 3, 5 of 5)...");
    const res4 = await DocumentService.process(files3, "delete-pages", { deleteMode: "odd" });
    assert(res4.success === true, "Delete odd pages response success is true");
    const savedJob4 = DocumentService.getJob(res4.jobId)!;
    const doc4 = await PDFDocument.load(savedJob4.buffer);
    assert(doc4.getPageCount() === 2, "Remaining pages count is 2 (Even pages left)");

    // ----------------------------------------------------
    // TEST 5: Delete Even Pages
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Delete Even Pages (2, 4 of 5)...");
    const res5 = await DocumentService.process(files3, "delete-pages", { deleteMode: "even" });
    assert(res5.success === true, "Delete even pages response success is true");
    const savedJob5 = DocumentService.getJob(res5.jobId)!;
    const doc5 = await PDFDocument.load(savedJob5.buffer);
    assert(doc5.getPageCount() === 3, "Remaining pages count is 3 (Odd pages left)");

    // ----------------------------------------------------
    // TEST 6: Delete First / Last Page
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Delete First Page and Last Page individually...");
    const res6First = await DocumentService.process(files3, "delete-pages", { deleteMode: "first" });
    const doc6First = await PDFDocument.load(DocumentService.getJob(res6First.jobId)!.buffer);
    assert(doc6First.getPageCount() === 4, "Remaining pages count is 4 after deleting first page");

    const res6Last = await DocumentService.process(files3, "delete-pages", { deleteMode: "last" });
    const doc6Last = await PDFDocument.load(DocumentService.getJob(res6Last.jobId)!.buffer);
    assert(doc6Last.getPageCount() === 4, "Remaining pages count is 4 after deleting last page");

    // ----------------------------------------------------
    // TEST 7: Large PDF files (100-page & 500-page)
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Large PDFs (100 pages and 500 pages) delete testing...");
    const pdf100 = await generateTestPdf(100);
    const files100 = [createMockMulterFile("doc100.pdf", pdf100)];
    const res100 = await DocumentService.process(files100, "delete-pages", { deleteMode: "selected", pages: "10-90" });
    const doc100 = await PDFDocument.load(DocumentService.getJob(res100.jobId)!.buffer);
    assert(doc100.getPageCount() === 19, "Remaining pages count after removing 10-90 is 19");

    const pdf500 = await generateTestPdf(500);
    const files500 = [createMockMulterFile("doc500.pdf", pdf500)];
    const res500 = await DocumentService.process(files500, "delete-pages", { deleteMode: "selected", pages: "1-499" });
    const doc500 = await PDFDocument.load(DocumentService.getJob(res500.jobId)!.buffer);
    assert(doc500.getPageCount() === 1, "Remaining pages count is exactly 1 page (the 500th page)");

    // ----------------------------------------------------
    // TEST 8: Landscape & Portrait Mix Preservation
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Mix of Landscape & Portrait PDFs preservation...");
    const pdfMix = await generateTestPdf(3, { landscapeIndices: [1] }); // Page 2 is landscape
    const filesMix = [createMockMulterFile("docMix.pdf", pdfMix)];
    const resMix = await DocumentService.process(filesMix, "delete-pages", { deleteMode: "selected", pages: "1" }); // Delete Page 1
    const docMix = await PDFDocument.load(DocumentService.getJob(resMix.jobId)!.buffer);
    assert(docMix.getPageCount() === 2, "Has remaining 2 pages");
    const page1Size = docMix.getPage(0).getSize();
    assert(page1Size.width > page1Size.height, "Remaining page 1 (originally page 2) maintains its Landscape orientation!");

    // ----------------------------------------------------
    // TEST 9: Prevention of deleting every page
    // ----------------------------------------------------
    console.log("\nRunning Test 9: Prevention of deleting every single page...");
    try {
      await DocumentService.process(files1, "delete-pages", { deleteMode: "selected", pages: "1-3" });
      assert(false, "Should have failed to delete all pages");
    } catch (err: any) {
      assert(
        err.message.includes("cannot delete all pages") || err.message.includes("At least one page must remain"),
        `Correctly rejected complete deletion with error: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 10: Invalid/Corrupted PDF Rejection
    // ----------------------------------------------------
    console.log("\nRunning Test 10: Corrupted PDF and Password-Protected PDF Rejection...");
    const corruptBuffer = Buffer.from("%PDF-1.4\nsome corrupted file stuff");
    try {
      await DocumentService.process([createMockMulterFile("corrupt.pdf", corruptBuffer)], "delete-pages", { deleteMode: "odd" });
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
      await DocumentService.process([createMockMulterFile("protected.pdf", encryptedBuffer)], "delete-pages", { deleteMode: "first" });
      assert(false, "Should have rejected encrypted file");
    } catch (err: any) {
      assert(
        err.message.includes("password-protected") || err.message.includes("encrypted"),
        `Correctly rejected password-protected file with error: "${err.message}"`
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
