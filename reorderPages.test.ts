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
  console.log("🚀 NIKPDF V2 AUTOMATED REORDER PDF PAGES TESTS");
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

  async function generateTestPdf(pagesCount: number, options?: { landscapeIndices?: number[], customSizes?: Record<number, [number, number]> }) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pagesCount; i++) {
      const isLandscape = options?.landscapeIndices?.includes(i);
      let pageSize: [number, number] = isLandscape ? [PageSizes.A4[1], PageSizes.A4[0]] as [number, number] : PageSizes.A4;
      if (options?.customSizes && options.customSizes[i]) {
        pageSize = options.customSizes[i];
      }
      const page = pdfDoc.addPage(pageSize);
      page.drawText(`Page ${i + 1}`);
    }
    return Buffer.from(await pdfDoc.save());
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Small PDF Page Reordering
    // ----------------------------------------------------
    console.log("Running Test 1: Reordering a 3-page PDF to 3,1,2...");
    const pdf1 = await generateTestPdf(3);
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "reorder-pages", { order: "3,1,2" });
    assert(res1.success === true, "Reorder pages response success status is true");
    assert(res1.outputName === "doc1_reordered.pdf", `Output filename is correct: ${res1.outputName}`);

    const savedJob1 = DocumentService.getJob(res1.jobId)!;
    const doc1 = await PDFDocument.load(savedJob1.buffer);
    assert(doc1.getPageCount() === 3, "Output document has exactly 3 pages");

    // ----------------------------------------------------
    // TEST 2: 100-page PDF Reordering
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Reordering a 100-page PDF (Reverse order)...");
    const pdf100 = await generateTestPdf(100);
    const files100 = [createMockMulterFile("doc100.pdf", pdf100)];
    
    // Create reverse order array
    const revOrder = Array.from({ length: 100 }, (_, i) => 100 - i).join(",");
    const res2 = await DocumentService.process(files100, "reorder-pages", { order: revOrder });
    assert(res2.success === true, "100-page reorder response success is true");
    
    const savedJob2 = DocumentService.getJob(res2.jobId)!;
    const doc2 = await PDFDocument.load(savedJob2.buffer);
    assert(doc2.getPageCount() === 100, "Output document contains exactly 100 pages");

    // ----------------------------------------------------
    // TEST 3: 500-page PDF Reordering
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Reordering a 500-page PDF (Swap page 1 and 500)...");
    const pdf500 = await generateTestPdf(500);
    const files500 = [createMockMulterFile("doc500.pdf", pdf500)];
    
    const swapOrderArr = Array.from({ length: 500 }, (_, i) => i + 1);
    swapOrderArr[0] = 500;
    swapOrderArr[499] = 1;
    const swapOrder = swapOrderArr.join(",");

    const res3 = await DocumentService.process(files500, "reorder-pages", { order: swapOrder });
    assert(res3.success === true, "500-page reorder response success is true");
    const savedJob3 = DocumentService.getJob(res3.jobId)!;
    const doc3 = await PDFDocument.load(savedJob3.buffer);
    assert(doc3.getPageCount() === 500, "Output document contains exactly 500 pages");

    // ----------------------------------------------------
    // TEST 4: Mixed Orientation & Sizes preservation
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Mixed orientation and page sizes preservation...");
    // Page 1: Portrait A4, Page 2: Landscape A4, Page 3: Custom Letter size (612, 792)
    const pdfMix = await generateTestPdf(3, {
      landscapeIndices: [1],
      customSizes: { 2: [612, 792] }
    });
    const filesMix = [createMockMulterFile("docMix.pdf", pdfMix)];
    // Reorder to 3, 2, 1
    const res4 = await DocumentService.process(filesMix, "reorder-pages", { order: "3,2,1" });
    assert(res4.success === true, "Mixed orientation/sizes reordered successfully");
    
    const savedJob4 = DocumentService.getJob(res4.jobId)!;
    const doc4 = await PDFDocument.load(savedJob4.buffer);
    
    const p1 = doc4.getPage(0).getSize(); // Was page 3 (612x792)
    const p2 = doc4.getPage(1).getSize(); // Was page 2 (landscape)
    const p3 = doc4.getPage(2).getSize(); // Was page 1 (portrait)

    assert(p1.width === 612 && p1.height === 792, "Page 1 matches custom sizing [612, 792]");
    assert(p2.width > p2.height, "Page 2 maintains landscape orientation");
    assert(p3.height > p3.width, "Page 3 maintains portrait orientation");

    // ----------------------------------------------------
    // TEST 5: Duplicate page detection validation
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Reorder validation - Duplicates detection...");
    try {
      await DocumentService.process(files1, "reorder-pages", { order: "1,2,2" });
      assert(false, "Should have thrown error on duplicate page numbers");
    } catch (err: any) {
      assert(err.message.includes("Duplicate page number") || err.message.includes("Invalid order"), `Correctly threw error on duplicates: "${err.message}"`);
    }

    // ----------------------------------------------------
    // TEST 6: Missing page detection validation
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Reorder validation - Missing pages detection...");
    try {
      await DocumentService.process(files1, "reorder-pages", { order: "1,2" });
      assert(false, "Should have thrown error when a page is missing");
    } catch (err: any) {
      assert(err.message.includes("specify exactly all") || err.message.includes("Invalid order"), `Correctly threw error on missing pages: "${err.message}"`);
    }

    // ----------------------------------------------------
    // TEST 7: Out of bounds detection validation
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Reorder validation - Out of bounds page index...");
    try {
      await DocumentService.process(files1, "reorder-pages", { order: "1,2,4" });
      assert(false, "Should have thrown error on out of bounds page index");
    } catch (err: any) {
      assert(err.message.includes("out of bounds") || err.message.includes("Invalid order"), `Correctly threw error on out of bounds page: "${err.message}"`);
    }

    // ----------------------------------------------------
    // TEST 8: Rejection of corrupted files
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Corrupted PDF file rejection...");
    const corruptBuffer = Buffer.from("%PDF-1.4\nsome corrupt file structure");
    try {
      await DocumentService.process([createMockMulterFile("corrupt.pdf", corruptBuffer)], "reorder-pages", { order: "1,2" });
      assert(false, "Should have rejected corrupted file");
    } catch (err: any) {
      assert(err.message.includes("corrupted") || err.message.includes("invalid"), `Correctly rejected corrupted PDF with error: "${err.message}"`);
    }

    // ----------------------------------------------------
    // TEST 9: Rejection of password-protected files
    // ----------------------------------------------------
    console.log("\nRunning Test 9: Password protected PDF file rejection...");
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
      await DocumentService.process([createMockMulterFile("protected.pdf", encryptedBuffer)], "reorder-pages", { order: "1" });
      assert(false, "Should have rejected password protected file");
    } catch (err: any) {
      assert(err.message.includes("password-protected") || err.message.includes("encrypted"), `Correctly rejected password protected PDF with error: "${err.message}"`);
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
