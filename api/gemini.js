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
            // Limpieza exhaustiva de etiquetas RTF para no ensuciar el análisis de la IA
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
        // CORRECCIÓN CRÍTICA: Usamos path.resolve para rutas en Vercel
        const ruta = path.resolve(process.cwd(), "data", nombre);
        
        if (!fs.existsSync(ruta)) {
            console.warn(`Archivo de referencia no encontrado: ${ruta}`);
            return ""; // Devolvemos vacío para que no rompa el Promise.all
        }
        const buffer = fs.readFileSync(ruta);
        return await extraerTexto(buffer, nombre);
    } catch (error) {
        console.error(`Error al leer archivo fijo ${nombre}:`, error);
        return "";
    }
}

export default async function handler(req, res) {
    // Solo permitimos peticiones POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        // Verificación de la API KEY
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("La GEMINI_API_KEY no está configurada en Vercel.");
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        // CARGA DE LOS 5 DOCUMENTOS DE REFERENCIA
        // Usamos Promise.all pero ahora no fallará si un archivo no existe
        const [instructivo, planilla, plantilla, resolucion, proyecto] = await Promise.all([
            leerArchivoFijo("instructivo.docx"),
            leerArchivoFijo("planilla.pdf"),
            leerArchivoFijo("plantilla.docx"),
            leerArchivoFijo("resolucion.docx"),
            leerArchivoFijo("proyecto.rtf")
        ]);

        const body = req.body;
        if (!body.archivo) {
            return res.status(400).json({ error: "No se recibió el archivo del PPO para evaluar." });
        }

        // Extracción del texto del PPO subido por el usuario
        const ppoTexto = await extraerTexto(Buffer.from(body.archivo, 'base64'), body.nombre);
        
        // Procesamiento de antecedentes si existen
        let antTexto = "";
        if (body.archivoAntBase64) {
            antTexto = await extraerTexto(Buffer.from(body.archivoAntBase64, 'base64'), body.nombreAnt);
        }

        // EL PROMPT PEDAGÓGICO COMPLETO (Sin recortes)
        const promptFinal = `
        Eres un experto pedagógico de la Dirección de Educación No Formal del GCABA. Tu misión es realizar una evaluación técnica, crítica y constructiva del siguiente Proyecto Participativo Organizativo (PPO).
        
        DOCUMENTOS NORMATIVOS DE REFERENCIA (Úsalos para contrastar el PPO):
        1. Instructivo de Criterios: ${instructivo}
        2. Planilla de Evaluación: ${planilla}
        3. Plantilla Oficial: ${plantilla}
        4. Resolución de Criterios: ${resolucion}
        5. Marco del Proyecto Pedagógico: ${proyecto}

        CONTENIDO DEL PPO A EVALUAR:
        ${ppoTexto}

        ANTECEDENTES ADJUNTOS:
        ${antTexto}

        VALORACIONES PREVIAS DEL EVALUADOR (Escala 1-10):
        - Claridad de Objetivos: ${body.c1}
        - Viabilidad: ${body.c2}
        - Encuadre Normativo: ${body.c3}

        ESTRUCTURA DEL INFORME REQUERIDA (Generar en HTML):
        <h3>1. Resumen Ejecutivo</h3><p>Análisis sucinto de la propuesta.</p>
        <h3>2. Análisis de Coherencia Interna</h3><p>Relación entre objetivos, contenidos y actividades.</p>
        <h3>3. Evaluación Normativa</h3><p>Cumplimiento de la Resolución y el Instructivo del GCABA.</p>
        <h3>4. Cuadro de Fortalezas y Debilidades</h3><ul><li>Detalles técnicos...</li></ul>
        <h3>5. Sugerencias de Mejora</h3><p>Recomendaciones pedagógicas concretas.</p>
        <h3>6. Dictamen Final</h3><p>Conclusión basada en los criterios del evaluador.</p>

        Usa un tono profesional, docente y preciso.
        `;

        const result = await model.generateContent(promptFinal);
        const response = await result.response;
        const text = response.text();

        return res.status(200).json({ mensaje: text });

    } catch (error) {
        console.error("Error en el servidor:", error);
        return res.status(500).json({ 
            error: "Error interno en el procesamiento pedagógico", 
            detalle: error.message 
        });
    }
}