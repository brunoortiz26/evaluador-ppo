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
        console.error(`Error extrayendo texto de ${nombreArchivo}:`, error);
        return "";
    }
}

async function leerArchivoFijo(nombre) {
    try {
        const ruta = path.join(process.cwd(), "data", nombre);
        if (!fs.existsSync(ruta)) {
            console.warn(`Archivo de referencia no encontrado: ${nombre}`);
            return `(Referencia ${nombre} no disponible)`;
        }
        const buffer = fs.readFileSync(ruta);
        return await extraerTexto(buffer, nombre);
    } catch (error) {
        console.error(`Error al leer archivo fijo ${nombre}:`, error);
        return "";
    }
}

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY no configurada.");
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const [instructivo, planilla, plantilla, resolucion, proyecto] = await Promise.all([
            leerArchivoFijo("instructivo.docx"),
            leerArchivoFijo("planilla.pdf"),
            leerArchivoFijo("plantilla.docx"),
            leerArchivoFijo("resolucion.docx"),
            leerArchivoFijo("proyecto.rtf")
        ]);

        const body = req.body;
        if (!body.archivo) return res.status(400).json({ error: "Falta el PPO." });

        const ppoTexto = await extraerTexto(Buffer.from(body.archivo, 'base64'), body.nombre);
        let antTexto = body.archivoAntBase64 ? await extraerTexto(Buffer.from(body.archivoAntBase64, 'base64'), body.nombreAnt) : "";

        const promptFinal = `
        Eres un experto pedagógico de la Dirección de Educación No Formal del GCABA. Evalúa críticamente el PPO adjunto.
        
        DOCUMENTOS DE REFERENCIA NORMATIVA:
        1. Instructivo: ${instructivo}
        2. Planilla: ${planilla}
        3. Plantilla: ${plantilla}
        4. Resolución: ${resolucion}
        5. Marco Pedagógico: ${proyecto}

        PPO A EVALUAR:
        ${ppoTexto}

        ANTECEDENTES:
        ${antTexto}

        VALORACIÓN DEL EVALUADOR (1-10): 
        Claridad=${body.c1}, Viabilidad=${body.c2}, Normativa=${body.c3}

        TAREA: Genera un informe técnico detallado en HTML (h3, strong, ul, li).
        Debe incluir: Resumen Ejecutivo, Análisis de Coherencia, Cumplimiento Normativo, Fortalezas/Debilidades, Sugerencias y Dictamen final.
        `;

        const result = await model.generateContent(promptFinal);
        const response = await result.response;
        return res.status(200).json({ mensaje: response.text() });

    } catch (error) {
        console.error("Error detallado:", error);
        return res.status(500).json({ error: "Error interno en el procesamiento pedagógico", detalle: error.message });
    }
}