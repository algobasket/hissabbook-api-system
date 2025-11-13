const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

/**
 * Save a base64 image to disk
 * @param {string} base64String - Base64 encoded image string (data:image/...;base64,...)
 * @param {string} prefix - Prefix for the filename (e.g., "qr-code", "payout")
 * @returns {Promise<string|null>} - Filename of the saved image or null
 */
async function saveImageToDisk(base64String, prefix = "image") {
  if (!base64String) {
    return null;
  }

  // Check if it's a data URL
  const matches = base64String.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    // If it's not a data URL, assume it's already a base64 string or a filename
    // If it's a valid filename (doesn't contain / or ..), return it as is
    if (base64String && !base64String.includes("/") && !base64String.includes("..")) {
      return base64String;
    }
    throw new Error("Invalid image format. Expected data URL or filename.");
  }

  const mimeType = matches[1];
  const data = matches[2];

  // Validate image MIME type
  if (!mimeType.startsWith("image/")) {
    throw new Error("Invalid file type. Only images are allowed.");
  }

  const buffer = Buffer.from(data, "base64");
  const extension = mimeType.split("/")[1] || "png";
  
  // Generate unique filename
  const uniqueId = typeof crypto.randomUUID === "function" 
    ? crypto.randomUUID() 
    : crypto.randomBytes(16).toString("hex");
  const fileName = `${prefix}-${Date.now()}-${uniqueId}.${extension}`;
  
  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(process.cwd(), "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  
  const filePath = path.join(uploadDir, fileName);
  await fs.writeFile(filePath, buffer);
  
  return fileName;
}

/**
 * Delete an image file from disk
 * @param {string} fileName - Name of the file to delete
 * @returns {Promise<boolean>} - True if deleted, false otherwise
 */
async function deleteImageFromDisk(fileName) {
  if (!fileName) {
    return false;
  }

  try {
    const uploadDir = path.join(process.cwd(), "uploads");
    const filePath = path.join(uploadDir, fileName);
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    // File doesn't exist or can't be deleted - that's okay
    return false;
  }
}

/**
 * Get the full path to an uploaded file
 * @param {string} fileName - Name of the file
 * @returns {string} - Full path to the file
 */
function getImagePath(fileName) {
  if (!fileName) {
    return null;
  }
  return path.join(process.cwd(), "uploads", fileName);
}

module.exports = {
  saveImageToDisk,
  deleteImageFromDisk,
  getImagePath,
};


