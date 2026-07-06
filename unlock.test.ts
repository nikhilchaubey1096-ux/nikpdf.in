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
  console.log("🚀 NIKPDF V2 AUTOMATED UNLOCK PDF TESTS");
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

  async function generateTestPdf(pagesCount: number, text = "Content") {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pagesCount; i++) {
      const page = pdfDoc.addPage(PageSizes.A4);
      page.drawText(`Page ${i + 1} ${text}`);
    }
    return Buffer.from(await pdfDoc.save());
  }

  try {
    // ----------------------------------------------------
    // TEST 1: User Password & RC4 Encryption (128-bit)
    // ----------------------------------------------------
    console.log("Running Test 1: Decrypting RC4/128-bit protected PDF with correct User password...");
    const pdf1 = await generateTestPdf(2, "RC4 Secure Doc");
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    // First encrypt it
    const enc1 = await DocumentService.process(files1, "protect-pdf", {
      userPassword: "UserPassword123!",
      ownerPassword: "OwnerPassword123!",
      encryption: "128",
    });
    const encryptedBuf1 = DocumentService.getJob(enc1.jobId)!.buffer;

    // Now unlock it
    const res1 = await DocumentService.process(
      [createMockMulterFile("doc1_encrypted.pdf", encryptedBuf1)],
      "unlock-pdf",
      { userPassword: "UserPassword123!" }
    );

    assert(res1.success === true, "Unlock completed successfully");
    assert(res1.outputName === "doc1_encrypted_unlocked.pdf", `Output file name correct: ${res1.outputName}`);

    const unlockedBuf1 = DocumentService.getJob(res1.jobId)!.buffer;
    // Loading unlocked PDF without password should succeed
    try {
      const parsed = await PDFDocument.load(unlockedBuf1);
      assert(parsed.getPageCount() === 2, "Successfully loaded unlocked PDF and page count is preserved");
    } catch (err: any) {
      assert(false, `Failed to load decrypted PDF: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 2: Owner Password & AES Encryption (256-bit)
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Decrypting AES/256-bit protected PDF with Owner password...");
    const pdf2 = await generateTestPdf(1, "AES Secure Doc");
    const files2 = [createMockMulterFile("doc2.pdf", pdf2)];

    // First encrypt it
    const enc2 = await DocumentService.process(files2, "protect-pdf", {
      userPassword: "UserPasswordXYZ!",
      ownerPassword: "OwnerPasswordXYZ!",
      encryption: "256",
    });
    const encryptedBuf2 = DocumentService.getJob(enc2.jobId)!.buffer;

    // Now unlock it using Owner password
    const res2 = await DocumentService.process(
      [createMockMulterFile("doc2_encrypted.pdf", encryptedBuf2)],
      "unlock-pdf",
      { ownerPassword: "OwnerPasswordXYZ!" }
    );

    assert(res2.success === true, "Unlock with Owner password completed successfully");
    const unlockedBuf2 = DocumentService.getJob(res2.jobId)!.buffer;
    try {
      const parsed = await PDFDocument.load(unlockedBuf2);
      assert(parsed.getPageCount() === 1, "Successfully loaded owner-unlocked PDF");
    } catch (err: any) {
      assert(false, `Failed to load owner-decrypted PDF: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 3: Wrong Password validation
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Attempting to unlock with wrong password...");
    try {
      await DocumentService.process(
        [createMockMulterFile("doc2_encrypted.pdf", encryptedBuf2)],
        "unlock-pdf",
        { userPassword: "IncorrectPassword123!" }
      );
      assert(false, "Allowed unlocking with incorrect password (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Incorrect Password") || err.message.includes("failed"), `Successfully caught incorrect password: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 4: Empty Password validation
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Attempting to unlock with empty password...");
    try {
      await DocumentService.process(
        [createMockMulterFile("doc2_encrypted.pdf", encryptedBuf2)],
        "unlock-pdf",
        { userPassword: "" }
      );
      assert(false, "Allowed unlocking with empty password (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Password Required"), `Successfully caught empty password: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 5: Corrupted PDF validation
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Attempting to unlock a corrupted/invalid PDF file...");
    const badBuffer = Buffer.from("Not a real PDF file header");
    try {
      await DocumentService.process(
        [createMockMulterFile("corrupted.pdf", badBuffer)],
        "unlock-pdf",
        { userPassword: "SomePassword123!" }
      );
      assert(false, "Allowed unlocking of corrupted file (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Invalid PDF"), `Successfully caught corrupted document: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 6: Already Unlocked PDF validation
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Attempting to unlock an already unprotected/decrypted PDF...");
    try {
      await DocumentService.process(
        [createMockMulterFile("unprotected.pdf", pdf1)],
        "unlock-pdf",
        { userPassword: "SomePassword123!" }
      );
      assert(false, "Allowed unlocking of unprotected document (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Not Protected") || err.message.includes("Unlocked"), `Successfully caught unprotected document: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 7: 100-page PDF Unlocking
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Encrypting and decrypting a 100-page PDF document...");
    const pdf100 = await generateTestPdf(100, "100 Page Content");
    const files100 = [createMockMulterFile("doc100.pdf", pdf100)];

    // Encrypt 100-page PDF
    const enc100 = await DocumentService.process(files100, "protect-pdf", {
      userPassword: "LargeUserPass123!",
    });
    const encryptedBuf100 = DocumentService.getJob(enc100.jobId)!.buffer;

    // Unlock 100-page PDF
    const res7 = await DocumentService.process(
      [createMockMulterFile("doc100_encrypted.pdf", encryptedBuf100)],
      "unlock-pdf",
      { userPassword: "LargeUserPass123!" }
    );
    assert(res7.success === true, "100-page document decrypted successfully!");
    const unlockedBuf100 = DocumentService.getJob(res7.jobId)!.buffer;
    const parsed100 = await PDFDocument.load(unlockedBuf100);
    assert(parsed100.getPageCount() === 100, "100-page document page count preserved");

    // ----------------------------------------------------
    // TEST 8: 500-page PDF Unlocking (Large File Test)
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Encrypting and decrypting a large 500-page PDF document...");
    const pdf500 = await generateTestPdf(500, "500 Page Content");
    const files500 = [createMockMulterFile("doc500.pdf", pdf500)];

    // Encrypt 500-page PDF
    const enc500 = await DocumentService.process(files500, "protect-pdf", {
      userPassword: "SuperLargePass123!",
    });
    const encryptedBuf500 = DocumentService.getJob(enc500.jobId)!.buffer;

    // Unlock 500-page PDF
    const res8 = await DocumentService.process(
      [createMockMulterFile("doc500_encrypted.pdf", encryptedBuf500)],
      "unlock-pdf",
      { userPassword: "SuperLargePass123!" }
    );
    assert(res8.success === true, "500-page document decrypted successfully!");
    const unlockedBuf500 = DocumentService.getJob(res8.jobId)!.buffer;
    const parsed500 = await PDFDocument.load(unlockedBuf500);
    assert(parsed500.getPageCount() === 500, "500-page document page count preserved");

    console.log("\n=================================================");
    console.log(`📊 TEST RUN RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error("Critical test runner exception occurred:", err);
    process.exit(1);
  }
}

runTests();
