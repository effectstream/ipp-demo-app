import Foundation

// Mirror of backend/src/types.ts. Codable so it round-trips JSON cleanly
// with the /api/v1/schema endpoint and a UserDefaults cache.

enum QuestionType: String, Codable {
    case text
    case number
    case boolean
    case multiselect
    case picker
    case date
    case address
}

struct Question: Codable, Hashable {
    var id: String
    var label: String
    var type: QuestionType
    var tab: String
    var order: Int
    var options: [String]?
    var allowCustom: Bool?
    var placeholder: String?
    var hidden: Bool?
    var dependsOn: String?
    // Reused for dependency value comparison so we can use the same
    // comparison logic the rest of the app uses on responses.
    var dependsOnValue: ResponseValue?
    // Optional clinical/authoring metadata stored verbatim.
    var labelEn: String?
    var rationale: String?
    var source: String?
    var tier: String?
}

struct FormTab: Codable, Hashable {
    var id: String
    var label: String
    var icon: String?
    var order: Int
}

struct FormSchema: Codable, Hashable {
    var version: Int
    var tabs: [FormTab]
    var questions: [Question]
}

extension FormSchema {
    func tab(id: String) -> FormTab? {
        tabs.first(where: { $0.id == id })
    }

    func question(id: String) -> Question? {
        questions.first(where: { $0.id == id })
    }

    func label(for questionId: String, fallback: String) -> String {
        question(id: questionId)?.label ?? fallback
    }

    func options(for questionId: String, fallback: [String]) -> [String] {
        question(id: questionId)?.options ?? fallback
    }

    func isHidden(_ questionId: String) -> Bool {
        question(id: questionId)?.hidden == true
    }

    func tabLabel(_ tabId: String, fallback: String) -> String {
        tab(id: tabId)?.label ?? fallback
    }

    func tabIcon(_ tabId: String, fallback: String) -> String {
        tab(id: tabId)?.icon ?? fallback
    }
}

// Bundled fallback used until the first successful network fetch (and as
// the offline default). Matches the backend's DEFAULT_SCHEMA so the app
// renders the original four tabs the first time it ever boots.
enum BundledSchema {
    static let value: FormSchema = FormSchema(
        version: 1,
        tabs: [
            FormTab(id: "datos", label: "Datos personales", icon: "person.text.rectangle", order: 1),
            FormTab(id: "antecedentes", label: "Antecedentes", icon: "list.clipboard", order: 2),
            FormTab(id: "ginecologia", label: "Ginecología", icon: "heart.text.square", order: 3),
            FormTab(id: "piso", label: "Piso pélvico", icon: "figure.stand", order: 4),
        ],
        questions: [
            // Datos personales
            Question(id: "nombre", label: "Nombre completo", type: .text, tab: "datos", order: 1),
            Question(id: "rut", label: "RUT", type: .text, tab: "datos", order: 2),
            Question(id: "edad", label: "Edad", type: .number, tab: "datos", order: 3),
            Question(id: "direccion", label: "Dirección", type: .address, tab: "datos", order: 4),
            // Antecedentes
            Question(id: "cirugias", label: "Cirugías", type: .multiselect, tab: "antecedentes", order: 1, options: [
                "Cesárea", "Apendicectomía", "Colecistectomía", "Histerectomía",
                "Hernioplastía", "Amigdalectomía", "Cirugía de várices",
            ], allowCustom: true),
            Question(id: "enfermedadesCronicas", label: "Enfermedades crónicas", type: .multiselect, tab: "antecedentes", order: 2, options: [
                "Hipertensión arterial", "Diabetes mellitus tipo 2", "Hipotiroidismo",
                "Asma", "Dislipidemia", "Migraña", "Depresión",
            ], allowCustom: true),
            Question(id: "medicamentos", label: "Medicamentos", type: .multiselect, tab: "antecedentes", order: 3, options: [
                "Losartán", "Metformina", "Levotiroxina", "Atorvastatina",
                "Omeprazol", "Sertralina", "Salbutamol",
            ], allowCustom: true),
            Question(id: "fuma", label: "¿Fuma?", type: .boolean, tab: "antecedentes", order: 4),
            Question(id: "cigarrosPorDia", label: "Cigarrillos por día", type: .number, tab: "antecedentes", order: 5, dependsOn: "fuma"),
            // Ginecología
            Question(id: "numeroHijos", label: "N° de hijos", type: .number, tab: "ginecologia", order: 1),
            Question(id: "usaAnticonceptivos", label: "Usa anticonceptivos", type: .boolean, tab: "ginecologia", order: 2),
            Question(id: "tipoAnticonceptivo", label: "Tipo de anticonceptivo", type: .text, tab: "ginecologia", order: 3, dependsOn: "usaAnticonceptivos"),
            // Piso pélvico
            Question(id: "escapeDeOrina", label: "¿Tiene escape de orina?", type: .boolean, tab: "piso", order: 1),
            Question(id: "frecuenciaEscape", label: "Frecuencia", type: .picker, tab: "piso", order: 2, options: [
                "Ocasional", "Al toser/estornudar", "Al hacer ejercicio", "Urgencia frecuente",
            ], dependsOn: "escapeDeOrina"),
            Question(id: "dolorPelvico", label: "Dolor pélvico", type: .boolean, tab: "piso", order: 3),
            Question(id: "prolapsoConocido", label: "Prolapso conocido", type: .boolean, tab: "piso", order: 4),
        ]
    )
}
