const { GoogleGenerativeAI } = require("@google/generative-ai");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");

// Configuración del modelo
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
            // Limpieza básica de etiquetas RTF
            return textoRtf.replace(/\\f[0-9x]|\\fs[0-9x]|\\f[0-9x]|\\par|\\tab|\\ldblquote|\\rdblquote|\\'e1|\\'e9|\\'ed|\\'f3|\\'fa|\\'f1|\\u[0-9]{4,5}\??/g, " ");
        }
        return buffer.toString('utf8');
    } catch (error) {
        console.error(`Error extrayendo texto de ${nombreArchivo}:`, error);
        return "";
    }
}

async function leerArchivoFijo(nombre) {
    try {
        // Buscamos en la carpeta 'data' en la raíz del proyecto
        const ruta = path.join(process.cwd(), "data", nombre);
        if (!fs.existsSync(ruta)) {
            console.error(`Archivo no encontrado: ${ruta}`);
            return "";
        }
        const buffer = fs.readFileSync(ruta);
        return await extraerTexto(buffer, nombre);
    } catch (error) {
        console.error(`Error al leer archivo fijo ${nombre}:`, error);
        return "";
    }
}

exports.handler = async (event) => {
    // Vercel maneja los métodos en event.method o event.httpMethod
    const method = event.httpMethod || event.method;
    if (method !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        // Carga de documentos de referencia (Nombres simplificados)
        const [inst, plani, planti, reso, proy] = await Promise.all([
            leerArchivoFijo("instructivo.docx"),
            leerArchivoFijo("planilla.pdf"),
            leerArchivoFijo("plantilla.docx"),
            leerArchivoFijo("resolucion.docx"),
            leerArchivoFijo("proyecto.rtf")
        ]);

        const body = JSON.parse(event.body);
        if (!body.archivo) {
            return { statusCode: 400, body: JSON.stringify({ error: "Falta el archivo PPO" }) };
        }

        const ppoUsuarioTexto = await extraerTexto(Buffer.from(body.archivo, 'base64'), body.nombre);

        const prompt = `
        Eres un experto pedagógico de la Dirección de Educación No Formal del GCABA. 
        Tu tarea es evaluar el siguiente Proyecto Participativo Organizativo (PPO).

        DOCUMENTOS DE REFERENCIA (Úsalos para comparar):
        1. Instructivo: ${inst}
        2. Planilla de Evaluación: ${plani}
        3. Plantilla Oficial: ${planti}
        4. Resolución Curricular: ${reso}
        5. Marco Pedagógico: ${proy}

        PROYECTO A EVALUAR:
        ${ppoUsuarioTexto}

        CRITERIOS DEL EVALUADOR (Escala 1-10):
        - Claridad de Objetivos: ${body.c1}
        - Viabilidad: ${body.c2}
        - Marco Normativo: ${body.c3}

        TAREA:
        Genera un informe técnico estructurado en HTML. Incluye fortalezas, debilidades y sugerencias de mejora basadas estrictamente en la normativa comparada.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mensaje: response.text() })
        };

    } catch (error) {
        console.error("Error en la función gemini:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Error interno del servidor", detalle: error.message })
        };
    }
};