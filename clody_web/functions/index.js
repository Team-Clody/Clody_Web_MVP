const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { OpenAI } = require("openai");

admin.initializeApp();
const db = admin.firestore();

// 글로벌 옵션 설정
setGlobalOptions({ maxInstances: 10 });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || require("firebase-functions").config().openai.key,
});

exports.submitDiary = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { diary } = req.body;
    if (!diary || typeof diary !== "string") {
      return res.status(400).send("Invalid diary input");
    }

    const userIP = req.headers["fastly-client-ip"] || req.headers["x-forwarded-for"] || req.ip;

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "일기 내용을 바탕으로 감정 분석을 해줘." },
        { role: "user", content: diary }
      ],
      max_tokens: 200,
    });

    const reply = chatCompletion.choices[0].message.content.trim();

    await db.collection("diaries").add({
      diary,
      reply,
      userIP,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send({ reply });

  } catch (error) {
    console.error("submitDiary error:", error);
    res.status(500).send("Internal Server Error");
  }
});