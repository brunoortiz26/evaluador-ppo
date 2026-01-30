const { GoogleGenerativeAI } = require("@google/generative-ai");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");

// Función universal para extraer texto (soporta PDF y Word)
async function extraerTexto(buffer, mimetype, nombre) {
    if (mimetype.includes("word") || nombre.endsWith(".docx")) {
        const res = await mammoth.extractRawText({ buffer });
        return res.value;
    } else {
        const data = await pdfParse(buffer);
        return data.text;
    }
}

// Función para leer los archivos de la carpeta /data
async function leerArchivoFijo(nombre) {
    const ruta = path.join(__dirname, "../../data", nombre);
    if (!fs.existsSync(ruta)) return `(Archivo ${nombre} no encontrado en /data)`;
    
    const buffer = fs.readFileSync(ruta);
    if (nombre.endsWith(".docx")) {
        const res = await mammoth.extractRawText({ buffer });
        return res.value;
    } else {
        const data = await pdfParse(buffer);
        return data.text;
    }
}

exports.handler = async (event) => {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: "Eres un auditor experto de la Coordinación de Educación No Formal del GCABA. Tu función es evaluar PPOs actuales basándote en la normativa fija y comparándolos con años anteriores para asegurar la mejora continua."
        });

        // 1. CARGA DE LOS 5 DOCUMENTOS FIJOS
        const instructivo = await leerArchivoFijo("Instructivo Proyecto Organizativo.pdf");
        const plantilla = await leerArchivoFijo("Plantilla de PPO.pdf");
        const resoCriterios = await leerArchivoFijo("Proyecto Organizativo (extracto de la Reso de criterios curriculares).pdf");
        const proyectoPedagogico = await leerArchivoFijo("PROYECTO PEDAGÓGICO ORGANIZATIVO.docx"); // Nombre corregido a .docx
        const planillaEvaluacion = await leerArchivoFijo("Planilla modelo de evaluación.pdf");

        const body = JSON.parse(event.body);
        
        // 2. PROCESAR PPO ACTUAL (Sección 1)
        const ppoActualTexto = await extraerTexto(Buffer.from(body.ppoActual, 'base64'), body.tipoPpo, body.nombrePpo);

        // 3. PROCESAR ANTECEDENTES (Sección 2 - Opcional)
        let antecedentesTexto = "No se proporcionaron antecedentes.";
        if (body.historial && body.historial.length > 0) {
            antecedentesTexto = "";
            for (let doc of body.historial) {
                const txt = await extraerTexto(Buffer.from(doc.data, 'base64'), doc.tipo, doc.nombre);
                antecedentesTexto += `\n--- ANTECEDENTE HISTÓRICO: ${doc.nombre} ---\n${txt}\n`;
            }
        }

        const promptFinal = `
        BASE NORMATIVA Y DE EVALUACIÓN:
        - Instructivo: ${instructivo}
        - Plantilla: ${plantilla}
        - Resolución: ${resoCriterios}
        - Marco PPO: ${proyectoPedagogico}
        - Criterios de Calificación: ${planillaEvaluacion}

        HISTORIAL Y MEJORAS PEDIDAS PREVIAMENTE:
        ${antecedentesTexto}

        PROYECTO 2025 A EVALUAR:
        ${ppoActualTexto}

        TAREA: 
        Realiza una auditoría profunda. Si hay antecedentes, verifica punto por punto si el centro corrigió lo que se le observó en años anteriores.

        FORMATO DE INFORME:
        1. PUNTAJE FINAL (0-100) según la Planilla de Evaluación.
        2. RESUMEN EJECUTIVO.
        3. ANÁLISIS DE MEJORA CONTINUA: (Comparar específicamente si el centro aplicó las mejoras sugeridas en los antecedentes).
        4. FORTALEZAS.
        5. DEBILIDADES Y RECOMENDACIONES (Si repiten errores pasados, destacarlo como grave).
        `;

        const result = await model.generateContent(promptFinal);
        return { statusCode: 200, body: JSON.stringify({ reply: result.response.text() }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};