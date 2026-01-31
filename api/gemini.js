import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const MODEL_NAME = "gemini-1.5-flash";

// Función de extracción de texto (Mantenemos tu lógica para PPO y Antecedentes)
async function extraerTexto(buffer, nombreArchivo) {
    const extension = nombreArchivo.split('.').pop().toLowerCase();
    try {
        if (extension === "docx") {
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        } else if (extension === "pdf") {
            const data = await pdfParse(buffer);
            return data.text;
        } else if (extension === "rtf") {
            const textoRtf = buffer.toString('utf8');
            return textoRtf.replace(/\\f[0-9x]|\\fs[0-9x]|\\par|\\tab|\\ldblquote|\\rdblquote|\\'e1|\\'e9|\\'ed|\\'f3|\\'fa|\\'f1|\\u[0-9]{4,5}\??/g, " ");
        }
        return buffer.toString('utf8');
    } catch (error) { return ""; }
}

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

    try {
        if (!process.env.GEMINI_API_KEY) throw new Error("Falta API KEY en Vercel");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const body = req.body;
        if (!body.archivo) return res.status(400).json({ error: "Falta el archivo PPO" });

        // Procesamos los archivos que sube el usuario
        const ppoTexto = await extraerTexto(Buffer.from(body.archivo, 'base64'), body.nombre);
        let antTexto = body.archivoAntBase64 ? await extraerTexto(Buffer.from(body.archivoAntBase64, 'base64'), body.nombreAnt) : "No se adjuntaron antecedentes.";

        // --- PROMPT CON NORMATIVA INTEGRADA ---
        // Esto elimina la necesidad de leer la carpeta /data y evita el Error 500
        const promptFinal = `
        Eres un experto pedagógico senior del GCABA. Evalúa el PPO adjunto considerando los criterios de la Resolución de Educación No Formal y el Instructivo vigente.
        
        SITUACIÓN: El evaluador humano ha calificado inicialmente con: 
        Claridad=${body.c1}/10, Viabilidad=${body.c2}/10, Normativa=${body.c3}/10.

        DOCUMENTO PPO A EVALUAR:
        ${ppoTexto}

        ANTECEDENTES:
        ${antTexto}

        TAREA: Genera un informe técnico detallado en HTML (h3, strong, ul, li).
        Debe contener:
        1. Resumen Ejecutivo (Análisis de la propuesta).
        2. Análisis de Coherencia Interna (Relación objetivos/actividades).
        3. Cumplimiento Normativo (Ajuste a criterios GCABA).
        4. Fortalezas y Debilidades (En formato lista).
        5. Sugerencias de Mejora Pedagógica.
        6. Dictamen Final.
        `;

        // Llamada a la IA con tiempo límite optimizado
        const result = await model.generateContent(promptFinal);
        const response = await result.response;
        
        return res.status(200).json({ mensaje: response.text() });

    } catch (error) {
        console.error("Error técnico:", error);
        return res.status(500).json({ 
            error: "Error interno en el procesamiento pedagógico", 
            detalle: error.message 
        });
    }
}