const { GoogleGenerativeAI } = require("@google/generative-ai");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");

// Función universal para extraer texto (PDF, Word, RTF/Texto)
async function extraerTexto(buffer, nombre) {
    const ext = nombre.toLowerCase();
    try {
        if (ext.endsWith(".docx")) {
            const res = await mammoth.extractRawText({ buffer });
            return res.value;
        } else if (ext.endsWith(".pdf")) {
            const data = await pdfParse(buffer);
            return data.text;
        } else {
            // Manejo para el archivo .rtf o texto plano
            return buffer.toString('utf8').replace(/\\f[0-9x]|\\fs[0-9x]|\\f[0-9x]|\\par|\\tab/g, ""); 
        }
    } catch (e) {
        return `Error leyendo ${nombre}: ${e.message}`;
    }
}

// Función para leer los archivos de la carpeta /data (Ajustado para Vercel)
async function leerArchivoFijo(nombre) {
    // process.cwd() es la raíz en Vercel, permitiendo llegar a /data
    const ruta = path.join(process.cwd(), "data", nombre);
    if (!fs.existsSync(ruta)) return `(Archivo ${nombre} no encontrado)`;
    
    const buffer = fs.readFileSync(ruta);
    return await extraerTexto(buffer, nombre);
}

exports.handler = async (event) => {
    // Compatibilidad de métodos Vercel (POST)
    const method = event.httpMethod || event.method;
    if (method !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 1. CARGA DE LOS 5 DOCUMENTOS FIJOS (Nombres exactos según tu VS Code)
        const instructivo = await leerArchivoFijo("Instructivo Proyecto Organizativo (extracto de la Reso de criterios curriculares).docx");
        const planillaEvaluacion = await leerArchivoFijo("Planilla modelo de evaluación.pdf");
        const plantilla = await leerArchivoFijo("Plantilla de PPO.docx");
        const resoCriterios = await leerArchivoFijo("Proyecto Organizativo (extracto de la Reso de criterios curriculares).docx");
        const proyectoPedagogico = await leerArchivoFijo("PROYECTO PEDAGÓGICO ORGANIZATIVO.rtf");

        // 2. RECIBIR DATOS DEL INDEX
        const body = JSON.parse(event.body);
        
        // Procesar PPO Actual
        const ppoActualTexto = await extraerTexto(Buffer.from(body.archivo, 'base64'), body.nombre);

        // Procesar Antecedentes (Opcional)
        let antecedentesTexto = "No se proporcionaron antecedentes.";
        if (body.archivoAntBase64) {
            const txtAnt = await extraerTexto(Buffer.from(body.archivoAntBase64, 'base64'), body.nombreAnt);
            antecedentesTexto = `--- ANTECEDENTE HISTÓRICO ENCONTRADO ---\n${txtAnt}`;
        }

        const promptFinal = `
        SISTEMA: Eres un auditor experto de la Coordinación de Educación No Formal del GCABA. Tu función es evaluar PPOs actuales basándote en la normativa fija y comparándolos con años anteriores para asegurar la mejora continua.

        BASE NORMATIVA Y DE EVALUACIÓN:
        - Instructivo: ${instructivo}
        - Plantilla: ${plantilla}
        - Resolución: ${resoCriterios}
        - Marco PPO: ${proyectoPedagogico}
        - Criterios de Calificación: ${planillaEvaluacion}

        CONFIGURACIÓN DE INTENSIDAD REQUERIDA POR EL USUARIO:
        - Claridad y Coherencia: ${body.c1}/10
        - Viabilidad: ${body.c2}/10
        - Adecuación Normativa: ${body.c3}/10

        HISTORIAL Y MEJORAS PEDIDAS PREVIAMENTE:
        ${antecedentesTexto}

        PROYECTO ACTUAL A EVALUAR:
        ${ppoActualTexto}

        TAREA: 
        Realiza una auditoría profunda. Usa los niveles de intensidad solicitados para ser más o menos estricto en cada apartado. 
        Si hay antecedentes, verifica punto por punto si el centro corrigió lo que se le observó.

        FORMATO DE INFORME:
        1. PUNTAJE FINAL (0-100) según la Planilla de Evaluación.
        2. RESUMEN EJECUTIVO.
        3. ANÁLISIS DE MEJORA CONTINUA.
        4. FORTALEZAS.
        5. DEBILIDADES Y RECOMENDACIONES.
        `;

        const result = await model.generateContent(promptFinal);
        const responseText = result.response.text();

        return { 
            statusCode: 200, 
            body: JSON.stringify({ mensaje: responseText }) 
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Error en el motor: " + error.message }) 
        };
    }
};