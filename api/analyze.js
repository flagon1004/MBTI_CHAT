// api/analyze.js — Vercel Serverless Function
// API 키는 Vercel 환경변수(GEMINI_API_KEY)에서만 읽음 → 브라우저 노출 없음

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { scores, answers, responseTimes, typeKey } = body;

    // ── 입력 검증
    if (!scores || !typeKey) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // ── 응답 시간 통계 계산
    const rtByIndicator = { EI: [], SN: [], TF: [], JP: [] };
    const indicatorMap = ['EI','EI','EI','EI','EI','SN','SN','SN','SN','SN','TF','TF','TF','TF','TF','JP','JP','JP','JP','JP'];
    responseTimes.forEach((rt, i) => {
      if (indicatorMap[i]) rtByIndicator[indicatorMap[i]].push(rt);
    });

    const rtStats = {};
    const totalAvg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    Object.entries(rtByIndicator).forEach(([key, rts]) => {
      const avg = rts.reduce((a, b) => a + b, 0) / rts.length;
      rtStats[key] = {
        avg: Math.round(avg),
        max: Math.max(...rts),
        ratio: +(avg / totalAvg).toFixed(2),
      };
    });

    // ── 중도 점수 감지 (40~60% = 갈등 구간)
    const pct = {
      E: Math.round(scores.E / 5 * 100), I: Math.round(scores.I / 5 * 100),
      S: Math.round(scores.S / 5 * 100), N: Math.round(scores.N / 5 * 100),
      T: Math.round(scores.T / 5 * 100), F: Math.round(scores.F / 5 * 100),
      J: Math.round(scores.J / 5 * 100), P: Math.round(scores.P / 5 * 100),
    };
    const ambiguous = [];
    [['E','I'],['S','N'],['T','F'],['J','P']].forEach(([a, b]) => {
      const dominant = Math.max(pct[a], pct[b]);
      if (dominant <= 65) ambiguous.push(`${a}/${b}(${dominant}%)`);
    });

    // ── Gemini 프롬프트 구성
    const prompt = `당신은 심리측정학 및 임상 상담 전문가입니다. MBTI Step II와 TCI 이론을 기반으로 아래 행동 데이터를 분석하십시오.

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

[중도적 점수 지표 (갈등 구간 40~65%)]
${ambiguous.length > 0 ? ambiguous.join(', ') : '없음'}

아래 JSON 형식으로만 응답하십시오. 다른 텍스트는 절대 포함하지 마십시오:
{
  "cognitive_dissonance": {
    "indicator": "가장 응답 지연이 높은 지표명(예:T/F)",
    "comment": "해당 지표의 심리적 갈등을 2문장으로 한국어 서술",
    "intensity": "low|medium|high"
  },
  "persona_gap": {
    "detected": true또는false,
    "comment": "기질과 사회적 페르소나 간 갭을 1~2문장으로 한국어 서술. 갭이 없으면 null"
  },
  "personalized_insight": "이 사람만의 고유한 심리 패턴을 2~3문장으로 한국어 서술. 일반적인 유형 설명이 아닌 응답 데이터에서 도출한 개인화된 통찰",
  "custom_do": "응답 데이터 기반 맞춤 실행 제언 1문장",
  "custom_dont": "응답 데이터 기반 맞춤 경계 사항 1문장"
}`;

    // ── Gemini API 호출
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // ── JSON 파싱 (펜스 제거 후)
    const clean = rawText.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(clean);

    return new Response(JSON.stringify({ success: true, analysis, typeKey }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('Analyze error:', err);
    // 폴백: 오류 시 기본 템플릿만 사용하도록 클라이언트에 신호
    return new Response(JSON.stringify({ success: false, fallback: true, error: err.message }), {
      status: 200, // 200으로 반환해 클라이언트가 폴백 처리
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
