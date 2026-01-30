const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const data = JSON.parse(event.body);
    const prompt = "Actúa como un experto pedagogo. Evalúa el siguiente PPO (Planificación de Prácticas Operativas) y proporciona sugerencias de mejora detalladas: " + data.prompt;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: response.text() }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error al procesar la solicitud con la IA" }),
    };
  }
};