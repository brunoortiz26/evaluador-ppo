import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import fs from "fs";
import path from "path";

const MODEL_NAME = "gemini-1.5-flash";

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
    } catch (error) {
        return "";
    }
}

async function leerArchivoFijo(nombre) {
    try {
        const ruta = path.join(process.cwd(), "data", nombre);
        if (fs.existsSync(ruta)) {
            const buffer = fs.readFileSync(ruta);
            return await extraerTexto(buffer, nombre);
        }
        return `(Referencia ${nombre} no disponible)`;
    } catch (error) {
        return "";
    }
}

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    try {
        if (!process.env.GEMINI_API_KEY) throw new Error("Falta API KEY");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const [instructivo, planilla, plantilla, resolucion, proyecto] = await Promise.all([
            leerArchivoFijo("instructivo.docx"),
            leerArchivoFijo("planilla.pdf"),
            leerArchivoFijo("plantilla.docx"),
            leerArchivoFijo("resolucion.docx"),
            leerArchivoFijo("proyecto.rtf")
        ]);

        const { archivo, nombre, archivoAntBase64, nombreAnt, c1, c2, c3 } = req.body;
        if (!archivo) return res.status(400).json({ error: "Falta archivo" });

        const ppoTexto = await extraerTexto(Buffer.from(archivo, 'base64'), nombre);
        let antTexto = archivoAntBase64 ? await extraerTexto(Buffer.from(archivoAntBase64, 'base64'), nombreAnt) : "";

        const promptFinal = `
        Eres un experto pedagógico del GCABA. Evalúa el PPO adjunto.
        REFERENCIAS: ${instructivo}, ${planilla}, ${plantilla}, ${resolucion}, ${proyecto}
        CONTENIDO: ${ppoTexto}
        ANTECEDENTES: ${antTexto}
        NOTAS: Objetivos=${c1}, Viabilidad=${c2}, Normativa=${c3}
        TAREA: Genera un informe detallado en HTML con: Resumen, Coherencia, Normativa, Fortalezas/Debilidades, Sugerencias y Dictamen.
        `;

        const result = await model.generateContent(promptFinal);
        const response = await result.response;
        return res.status(200).json({ mensaje: response.text() });
    } catch (error) {
        return res.status(500).json({ error: "Error interno en el procesamiento pedagógico", detalle: error.message });
    }
}