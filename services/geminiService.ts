
import { GoogleGenAI, Type } from "@google/genai";
import { AIProjectSuggestion } from "../types";

export const getAIProjectBreakdown = async (projectName: string, description: string): Promise<AIProjectSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Break down the following project into a list of 5 actionable tasks with logical due date offsets (in days from today). 
      Project Name: ${projectName}
      Project Description: ${description}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Clear and concise task title" },
              description: { type: Type.STRING, description: "Short explanation of the task" },
              dueDateOffsetDays: { type: Type.INTEGER, description: "Number of days from now this task should be due" }
            },
            required: ["title", "description", "dueDateOffsetDays"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text.trim());
  } catch (error) {
    console.error("Gemini Error:", error);
    return [];
  }
};
