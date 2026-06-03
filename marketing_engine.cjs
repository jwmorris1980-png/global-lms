const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function generateOutreach(platform = "Twitter/X", region = "Global") {
    const prompt = `You are a viral marketing expert for a revolutionary Global LMS. 
    Generate 3 high-impact posts for ${platform} targeting parents and educators in ${region}.
    
    The USP (Unique Selling Point) is:
    1. Cultural Infusion: AI that adapts to the student's local culture/metaphors.
    2. Global Equity: Paid in US/UK, but FREE in Pakistan, Ethiopia, and conflict zones.
    3. Personalized Learning Adventures for K-12.
    
    Make the tone inspiring, tech-forward, and world-class. Include hashtags.`;

    try {
        const result = await model.generateContent(prompt);
        console.log(`\n=== 🚀 MARKETING CAMPAIGN [${platform} - ${region}] ===\n`);
        console.log(result.response.text());
        console.log("\n==============================================\n");
    } catch (err) {
        console.error("Marketing engine failed:", err);
    }
}

// Example usage: Generate campaign for various platforms
generateOutreach("Twitter/X", "Global South");
generateOutreach("LinkedIn", "Educational Philanthropists");
generateOutreach("Facebook Groups", "Homeschooling Parents");
