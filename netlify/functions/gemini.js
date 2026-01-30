const { GoogleGenerativeAI } = require("@google/generative-ai");
const mammoth = require("mammoth");
const pdf = require("pdf-parse");

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const body = JSON.parse(event.body);
    let textoExtraido = "";

    // Lógica para procesar el archivo según su tipo
    if (body.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const buffer = Buffer.from(body.content, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      textoExtraido = result.value;
    } else if (body.type === "application/pdf") {
      const buffer = Buffer.from(body.content, 'base64');
      const data = await pdf(buffer);
      textoExtraido = data.text;
    } else {
      textoExtraido = body.content; // Texto plano
    }

    const prompt = "Actúa como un experto pedagogo. Analiza exhaustivamente la siguiente planificación (PPO) y proporciona un feedback detallado con fortalezas, debilidades y sugerencias de mejora: " + textoExtraido;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: response.text() }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error al procesar el documento: " + error.message }),
    };
  }
};