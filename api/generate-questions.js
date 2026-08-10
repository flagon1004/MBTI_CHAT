// api/generate-questions.js — Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { gender, age, job, hobbies } = req.body;

    const safeGender = gender || '선택 안 함';
    const safeAge   = age    || '선택 안 함';
    const safeJob   = (job && job.trim()) ? job.trim() : '무직';
    const safeHobbies = Array.isArray(hobbies) && hobbies.length > 0
      ? hobbies.join(', ') : '없음';

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return res.status(200).json({ success: false, error: 'No API key' });
    }

    const prompt = `당신은 MBTI 심리측정 전문가입니다. 아래 사용자 정보를 바탕으로 한국어 맞춤 질문 16개를 생성하십시오.

[사용자 정보]
성별: ${safeGender}
연령대: ${safeAge}
직업: ${safeJob}
취미: ${safeHobbies}

[규칙]
1. MBTI 4대 지표(E/I, S/N, T/F, J/P)별 정확히 4문항씩, 총 16문항을 생성한다.
2. 각 질문의 상황(context)은 반드시 위 직업 또는 취미와 관련된 실제 상황이어야 한다.
3. 선택지 A와 B는 해당 지표의 양극단을 명확히 반영해야 하며, 어느 쪽도 옳고 그름이 없어야 한다.
4. 한국 문화와 직장 환경을 기준으로 자연스러운 한국어로 작성한다.
5. scoreA와 scoreB에는 반드시 E, I, S, N, T, F, J, P 중 하나를 입력한다.
6. 반드시 JSON 배열 형식으로만 응답하고 다른 설명이나 문구는 생략한다.

[출력 형식]
[
  {
    "indicator": "E/I",
    "context": "SITUATION · 상황 한 줄 설명",
    "text": "질문 내용",
    "optionA": "선택지 A 내용",
    "optionB": "선택지 B 내용",
    "scoreA": "E",
    "scoreB": "I"
  }
]`;

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`;

const geminiRes = await fetch(GEMINI_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4000,
      responseMimeType: "application/json",
    },
  }),
});

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      throw new Error(`Gemini API error: ${geminiRes.status} - ${errBody}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // 안전한 JSON 문자열 정제
    let clean = rawText.replace(/```json|```/gi, '').trim();
    
    // 만약 JSON 배열 외에 다른 텍스트가 붙은 경우 배열 부분만 추출
    const firstBracket = clean.indexOf('[');
    const lastBracket = clean.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      clean = clean.substring(firstBracket, lastBracket + 1);
    }

    const questions = JSON.parse(clean);

    if (!Array.isArray(questions) || questions.length < 16) {
      throw new Error(`질문 수 부족: ${questions.length}개`);
    }
    const required = ['indicator','context','text','optionA','optionB','scoreA','scoreB'];
    for (const q of questions) {
      for (const field of required) {
        if (!q[field]) throw new Error(`필드 누락: ${field}`);
      }
    }

    return res.status(200).json({ success: true, questions: questions.slice(0, 16) });

  } catch (err) {
    console.error('generate-questions error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
