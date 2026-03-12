// api/analyze.js — Vercel Serverless Function
// API 키는 Vercel 환경변수(GEMINI_API_KEY)에서만 읽음 → 브라우저 노출 없음

export default async function handler(req, res) {

  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { scores, answers, responseTimes, typeKey, userProfile } = req.body;

    if (!scores || !typeKey) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    // ── 사용자 정보
    const profile = userProfile || { gender: '선택 안 함', age: '선택 안 함', job: '무직', hobbies: [] };

    // ── 응답 시간 통계 계산 (16문항: 지표당 4문항)
    const indicatorMap = [
      'EI','EI','EI','EI',
      'SN','SN','SN','SN',
      'TF','TF','TF','TF',
      'JP','JP','JP','JP'
    ];
    const rtByIndicator = { EI: [], SN: [], TF: [], JP: [] };
    responseTimes.forEach((rt, i) => {
      if (indicatorMap[i]) rtByIndicator[indicatorMap[i]].push(rt);
    });

    const totalAvg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const rtStats = {};
    Object.entries(rtByIndicator).forEach(([key, rts]) => {
      const avg = rts.reduce((a, b) => a + b, 0) / rts.length;
      rtStats[key] = {
        avg: Math.round(avg),
        max: Math.max(...rts),
        ratio: +(avg / totalAvg).toFixed(2),
      };
    });

    // ── 중도 점수 감지 (16문항: 지표당 4문항)
    const pct = {
      E: Math.round(scores.E / 4 * 100), I: Math.round(scores.I / 4 * 100),
      S: Math.round(scores.S / 4 * 100), N: Math.round(scores.N / 4 * 100),
      T: Math.round(scores.T / 4 * 100), F: Math.round(scores.F / 4 * 100),
      J: Math.round(scores.J / 4 * 100), P: Math.round(scores.P / 4 * 100),
    };
    const ambiguous = [];
    [['E','I'],['S','N'],['T','F'],['J','P']].forEach(([a, b]) => {
      const dominant = Math.max(pct[a], pct[b]);
      if (dominant <= 65) ambiguous.push(`${a}/${b}(${dominant}%)`);
    });

    // ── Gemini 프롬프트
    const prompt = `당신은 심리측정학 및 임상 상담 전문가입니다. MBTI Step II와 TCI 이론을 기반으로 아래 행동 데이터를 분석하십시오.

[사용자 정보]
성별: ${profile.gender} | 연령대: ${profile.age} | 직업: ${profile.job} | 취미: ${(profile.hobbies||[]).join(', ')||'없음'}

[기초 MBTI 점수]
E:${scores.E}/I:${scores.I} | S:${scores.S}/N:${scores.N} | T:${scores.T}/F:${scores.F} | J:${scores.J}/P:${scores.P}
도출 유형: ${typeKey}
퍼센트: E${pct.E}% I${pct.I}% | S${pct.S}% N${pct.N}% | T${pct.T}% F${pct.F}% | J${pct.J}% P${pct.P}%

[지표별 평균 응답시간 (ms)]
E/I: ${rtStats.EI.avg}ms (전체평균 대비 ${rtStats.EI.ratio}배)
S/N: ${rtStats.SN.avg}ms (전체평균 대비 ${rtStats.SN.ratio}배)
T/F: ${rtStats.TF.avg}ms (전체평균 대비 ${rtStats.TF.ratio}배)
J/P: ${rtStats.JP.avg}ms (전체평균 대비 ${rtStats.JP.ratio}배)
전체 평균: ${Math.round(totalAvg)}ms

[중도적 점수 지표]
${ambiguous.length > 0 ? ambiguous.join(', ') : '없음'}

아래 JSON 형식으로만 응답하십시오. 다른 텍스트는 절대 포함하지 마십시오:
{
  "cognitive_dissonance": {
    "indicator": "가장 응답 지연이 높은 지표명(예:T/F)",
    "comment": "해당 지표의 심리적 갈등을 2문장으로 한국어 서술",
    "intensity": "low또는medium또는high 중 하나"
  },
  "persona_gap": {
    "detected": true또는false,
    "comment": "기질과 사회적 페르소나 간 갭을 1~2문장으로 한국어 서술. 갭이 없으면 null"
  },
  "personalized_insight": "이 사람만의 고유한 심리 패턴을 2~3문장으로 한국어 서술",
  "custom_do": "응답 데이터 기반 맞춤 실행 제언 1문장",
  "custom_dont": "응답 데이터 기반 맞춤 경계 사항 1문장"
}`;

    // ── Gemini API 호출 (모델명 수정)
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_KEY) {
      return res.status(200).json({ success: false, fallback: true, error: 'No API key' });
    }

    // 최신 모델명으로 변경
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 600,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      throw new Error(`Gemini API error: ${geminiRes.status} - ${errBody}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // ── JSON 파싱
    const clean = rawText.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(clean);

    return res.status(200).json({ success: true, analysis, typeKey });

  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(200).json({ success: false, fallback: true, error: err.message });
  }
}
