import type { FormSchema } from "./types.ts";

// Default schema seeded into form_schema on first startup. Mirrors the
// hard-coded layout the iOS app shipped with so existing patients render
// identically until someone edits the schema via the web.
export const DEFAULT_SCHEMA: FormSchema = {
  version: 1,
  tabs: [
    { id: "datos",        label: "Datos personales", icon: "person.text.rectangle", order: 1 },
    { id: "antecedentes", label: "Antecedentes",     icon: "list.clipboard",        order: 2 },
    { id: "ginecologia",  label: "Ginecología",      icon: "heart.text.square",     order: 3 },
    { id: "piso",         label: "Piso pélvico",     icon: "figure.stand",          order: 4 },
  ],
  questions: [
    // Datos personales
    { id: "nombre",    label: "Nombre completo", type: "text",    tab: "datos", order: 1 },
    { id: "rut",       label: "RUT",             type: "text",    tab: "datos", order: 2 },
    { id: "edad",      label: "Edad",            type: "number",  tab: "datos", order: 3 },
    { id: "direccion", label: "Dirección",       type: "address", tab: "datos", order: 4 },

    // Antecedentes generales
    {
      id: "cirugias", label: "Cirugías", type: "multiselect",
      tab: "antecedentes", order: 1, allowCustom: true,
      options: [
        "Cesárea", "Apendicectomía", "Colecistectomía", "Histerectomía",
        "Hernioplastía", "Amigdalectomía", "Cirugía de várices",
      ],
    },
    {
      id: "enfermedadesCronicas", label: "Enfermedades crónicas", type: "multiselect",
      tab: "antecedentes", order: 2, allowCustom: true,
      options: [
        "Hipertensión arterial", "Diabetes mellitus tipo 2", "Hipotiroidismo",
        "Asma", "Dislipidemia", "Migraña", "Depresión",
      ],
    },
    {
      id: "medicamentos", label: "Medicamentos", type: "multiselect",
      tab: "antecedentes", order: 3, allowCustom: true,
      options: [
        "Losartán", "Metformina", "Levotiroxina", "Atorvastatina",
        "Omeprazol", "Sertralina", "Salbutamol",
      ],
    },
    { id: "fuma", label: "¿Fuma?", type: "boolean", tab: "antecedentes", order: 4 },
    {
      id: "cigarrosPorDia", label: "Cigarrillos por día", type: "number",
      tab: "antecedentes", order: 5,
      dependsOn: "fuma", dependsOnValue: true,
    },

    // Ginecología
    { id: "numeroHijos", label: "N° de hijos", type: "number", tab: "ginecologia", order: 1 },
    { id: "usaAnticonceptivos", label: "Usa anticonceptivos", type: "boolean", tab: "ginecologia", order: 2 },
    {
      id: "tipoAnticonceptivo", label: "Tipo de anticonceptivo", type: "text",
      tab: "ginecologia", order: 3,
      dependsOn: "usaAnticonceptivos", dependsOnValue: true,
    },

    // Piso pélvico
    { id: "escapeDeOrina", label: "¿Tiene escape de orina?", type: "boolean", tab: "piso", order: 1 },
    {
      id: "frecuenciaEscape", label: "Frecuencia", type: "picker",
      tab: "piso", order: 2,
      dependsOn: "escapeDeOrina", dependsOnValue: true,
      options: ["Ocasional", "Al toser/estornudar", "Al hacer ejercicio", "Urgencia frecuente"],
    },
    { id: "dolorPelvico", label: "Dolor pélvico", type: "boolean", tab: "piso", order: 3 },
    { id: "prolapsoConocido", label: "Prolapso conocido", type: "boolean", tab: "piso", order: 4 },
  ],
};
