require("dotenv").config();
const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 5000;


const apiKey = process.env.UXiuVrPtumGGZE69A4rno4SzasyJ1UlY;
const externalUserId = process.env.66e2f81df068cd8a42908659;

// Multer for image upload
const upload = multer({ dest: "upload/" });
app.use(express.json({ limit: "10mb" }));

// Ensure 'upload/' directory exists
if (!fs.existsSync('upload')) {
    fs.mkdirSync('upload');
}

// Function to create a chat session
async function createChatSession() {
    try {
        const response = await axios.post(
            'https://api.on-demand.io/chat/v1/sessions',
            {
                pluginIds: [],
                externalUserId: externalUserId
            },
            {
                headers: {
                    apikey: apiKey
                }
            }
        );
        return response.data.data.id; // Extract session ID
    } catch (error) {
        console.error('Error creating chat session:', error);
        throw error;
    }
}

// Function to submit a query for analyzing the plant image
async function submitQuery(sessionId, imageData) {
    try {
        const response = await axios.post(
            `https://api.on-demand.io/chat/v1/sessions/${sessionId}/query`,
            {
                endpointId: 'predefined-openai-gpt4o',
                query: `Analyze this plant image: ${imageData.slice(0, 100)}...`, // Partial base64 string to avoid prompt overload
                pluginIds: ['plugin-1712327325', 'plugin-1713962163', 'plugin-1726246222'], // Sample plugin IDs
                responseMode: 'sync'
            },
            {
                headers: {
                    apikey: apiKey
                }
            }
        );
        return response.data.data.response;
    } catch (error) {
        console.error('Error submitting query:', error);
        throw error;
    }
}

// Route to handle plant image upload and analysis
app.post("/analyze", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file uploaded" });
        }

        const imagePath = req.file.path;
        const imageData = await fsPromises.readFile(imagePath, { encoding: "base64" });

        // Create a chat session
        const sessionId = await createChatSession();

        if (sessionId) {
            // Submit the query with the image data
            const plantAnalysis = await submitQuery(sessionId, imageData);

            // Clean up the uploaded file
            await fsPromises.unlink(imagePath);

            // Return the analysis response
            res.json({
                result: plantAnalysis,
                image: `data:${req.file.mimetype};base64,${imageData}`
            });
        }
    } catch (error) {
        console.error("Error during image analysis:", error.message);
        res.status(500).json({ error: "An error occurred during the image analysis" });
    }
});

// Route to download the analysis report as a PDF
app.post("/download", express.json(), async (req, res) => {
    const { result, image } = req.body;
    try {
        const reportsDir = path.join(__dirname, "reports");
        await fsPromises.mkdir(reportsDir, { recursive: true });

        const filename = `plant_analysis_report_${Date.now()}.pdf`;
        const filePath = path.join(reportsDir, filename);
        const writeStream = fs.createWriteStream(filePath);
        const doc = new PDFDocument();
        doc.pipe(writeStream);

        // Add content to the PDF
        doc.fontSize(24).text("Plant Analysis Report", { align: "center" });
        doc.moveDown();
        doc.fontSize(16).text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();
        doc.fontSize(14).text(result, { align: "left" });

        // Insert image into the PDF
        if (image) {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");
            doc.moveDown();
            doc.image(buffer, { fit: [500, 300], align: "center", valign: "center" });
        }

        doc.end();

        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        res.download(filePath, (err) => {
            if (err) {
                res.status(500).json({ error: "Error downloading the PDF report" });
            }
            fsPromises.unlink(filePath);
        });
    } catch (error) {
        console.error("Error generating PDF report:", error.message);
        res.status(500).json({ error: "An error occurred while generating the PDF report" });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
