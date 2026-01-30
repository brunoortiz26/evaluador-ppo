const { GoogleGenerativeAI } = require("@google/generative-ai");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");

// Función universal para extraer texto (soporta PDF y Word)
async function extraerTexto(buffer, nombre) {
    if (nombre.toLowerCase().endsWith(".docx")) {
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
    if (nombre.toLowerCase().endsWith(".docx")) {
        const res = await mammoth.extractRawText({ buffer });
        return res.value;
    } else {
        const data = await pdfParse(buffer);
        return data.text;
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

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
        const proyectoPedagogico = await leerArchivoFijo("PROYECTO PEDAGÓGICO ORGANIZATIVO.docx");
        const planillaEvaluacion = await leerArchivoFijo("Planilla modelo de evaluación.pdf");

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
        const responseText = await result.response.text();

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