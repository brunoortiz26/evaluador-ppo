import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const MODEL_NAME = "gemini-1.5-flash";

// Función simplificada de extracción de texto
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
        return "Error en la lectura de este archivo específico.";
    }
}

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    try {
        // 1. Verificación inmediata de la clave
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "La clave GEMINI_API_KEY no está configurada en Vercel." });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const { archivo, nombre, archivoAntBase64, nombreAnt, c1, c2, c3 } = req.body;

        if (!archivo) return res.status(400).json({ error: "No se recibió el archivo del PPO." });

        // 2. Procesamiento de archivos del usuario
        const ppoTexto = await extraerTexto(Buffer.from(archivo, 'base64'), nombre);
        let antTexto = "No se adjuntaron antecedentes.";
        if (archivoAntBase64) {
            antTexto = await extraerTexto(Buffer.from(archivoAntBase64, 'base64'), nombreAnt);
        }

        // 3. Prompt actualizado con formato PPO 2027 y grilla de devolución 2027
        const promptFinal = `
Eres un experto pedagógico de la Dirección de Educación No Formal del GCABA.
Tu tarea es evaluar el Proyecto Pedagógico y Organizativo (PPO) que se te presenta a continuación.

CONTEXTO IMPORTANTE:
- El PPO a evaluar puede estar presentado en el NUEVO FORMATO 2027 o en el FORMATO ANTERIOR (años previos). Debés identificar el formato automáticamente y aplicar los criterios correspondientes.
- Si se adjuntan antecedentes (PPOs de años anteriores), estos estarán en el formato antiguo. Usálos como referencia histórica del centro, no como el PPO a evaluar.

VALORACIÓN DEL EVALUADOR (ponderaciones): Claridad y coherencia=${c1}/10 · Viabilidad de actividades=${c2}/10 · Adecuación normativa=${c3}/10.

=== PPO A EVALUAR ===
${ppoTexto}

=== ANTECEDENTES / HISTORIAL DEL CENTRO (formato anterior, si corresponde) ===
${antTexto}

=== GRILLA DE EVALUACIÓN PPO 2027 (aplicar si el PPO está en formato 2027) ===

GENERAL:
- La redacción es clara
- Cumple con la estructura del nuevo formato 2027
- Se recuperan datos del SIENFO

DIAGNÓSTICO DE LA SITUACIÓN (Punto 1 del formato 2027):
- Presenta una caracterización actual del centro (no solo historia, sino "radiografía del presente")
- Caracteriza el entorno socioeconómico y sus cambios recientes
- Se describe el perfil de las/los estudiantes y qué consiguen al finalizar los cursos
- Se identifican fortalezas y debilidades institucionales
- Se recupera lo trabajado en los Espacios de Mejora Institucional (EMI)
- Se incluyen datos de matrícula y egreso (si corresponde)

FUNDAMENTACIÓN Y JUSTIFICACIÓN (Punto 2 del formato 2027):
- Menciona claramente los desafíos y/o problemas que busca resolver con este proyecto
- Se fundamenta el "Por qué" y "Para qué" del proyecto
- Se menciona el impacto deseado en la comunidad y los beneficiarios

OBJETIVOS Y LÍNEAS DE ACCIÓN (Punto 3 del formato 2027):
- Se incluyen objetivos concretos vinculados a las Prioridades 2027
- Los objetivos son coherentes con el diagnóstico y la fundamentación/justificación
- Se explicitan líneas de acción concretas (articulación entre talleres, trabajo conjunto docente, relevamientos, prácticas asociativas, etc.)
- Cada prioridad incluye: situación/desafío, objetivo, acciones iniciales, participantes, indicador de avance, momento de revisión, acompañamiento requerido
- Los indicadores de avance son pertinentes y medibles

OFERTA EDUCATIVA PROPUESTA 2027 (Punto 4 del formato 2027):
- Se adjunta cuadro completo con cursos, áreas y cupos máximos de estudiantes
- La oferta se adecúa al contexto y al diagnóstico presentado

RECURSOS (Punto 5 del formato 2027):
- Se describe el entorno formativo y el herramental necesario para el desarrollo del proyecto (no una lista exhaustiva, sino lo relevante para el proyecto)

NOTA SOBRE FORMATO ANTERIOR:
Si el PPO está en el formato anterior (diagnóstico, fundamentación, justificación, objetivos, oferta, cupos, recursos, seguimiento como secciones separadas), evaluá con los criterios conceptuales equivalentes mencionados arriba, adaptados a esa estructura.

=== TAREA ===
Generá un informe técnico detallado de devolución en HTML usando etiquetas h3, strong, ul, li, p.
El informe debe contener obligatoriamente las siguientes secciones:

1. <h3>Resumen Ejecutivo</h3>: Síntesis del PPO evaluado (formato detectado, ciclo lectivo, datos del centro si los hay) y valoración general.

2. <h3>Evaluación por Secciones</h3>: Analizá cada sección según la grilla 2027 (o criterios equivalentes para formato anterior). Para cada ítem de la grilla indicá si está cumplido, parcialmente cumplido o ausente, con observaciones concretas.

3. <h3>Coherencia Interna</h3>: ¿El diagnóstico, fundamentación, objetivos y oferta son coherentes entre sí?

4. <h3>Cumplimiento Normativo y Estructural</h3>: ¿El PPO cumple con los requisitos formales del formato 2027 (o del formato vigente en el año del PPO)?

5. <h3>Fortalezas</h3>: Aspectos destacados del proyecto.

6. <h3>Aspectos a Mejorar y Sugerencias</h3>: Observaciones y recomendaciones concretas para cada debilidad detectada.

7. <h3>Consideración del Historial del Centro</h3>: Si se adjuntaron antecedentes, indicá en qué medida el PPO 2027 retoma o supera lo trabajado en años anteriores.

8. <h3>Dictamen Final</h3>: Valoración ponderada usando las ponderaciones del evaluador (Claridad=${c1}/10, Viabilidad=${c2}/10, Normativa=${c3}/10). Concluí con una de estas tres opciones: APROBADO / APROBADO CON OBSERVACIONES / REQUIERE REFORMULACIÓN.
        `;

        // 4. Llamada a la IA
        const result = await model.generateContent(promptFinal);
        const response = await result.response;
        const texto = response.text();

        return res.status(200).json({ mensaje: texto });

    } catch (error) {
        console.error("Error detallado:", error);
        return res.status(500).json({ 
            error: "Error interno en el procesamiento pedagógico", 
            detalle: error.message 
        });
    }
}