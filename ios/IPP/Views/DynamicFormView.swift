import SwiftUI

// Renders every question in a given tab using whatever widget matches its
// type. Iterates the schema (so add/remove/reorder/relabel via the web
// instantly reflects here) and binds each input to patient.responses[id].
struct DynamicFormView: View {
    let tabId: String
    @Binding var responses: [String: ResponseValue]
    var stats: FieldStatsBundle?
    @EnvironmentObject private var schemaService: SchemaService

    private var schema: FormSchema { schemaService.schema }

    private var questionsForTab: [Question] {
        schema.questions
            .filter { $0.tab == tabId && $0.hidden != true }
            .sorted { $0.order < $1.order }
    }

    private func isVisible(_ q: Question) -> Bool {
        guard let dep = q.dependsOn, let want = q.dependsOnValue else { return true }
        let actual = responses[dep] ?? .null
        return actual == want
    }

    var body: some View {
        Form {
            ForEach(questionsForTab, id: \.id) { question in
                if isVisible(question) {
                    QuestionRow(question: question, responses: $responses, stats: stats)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.ippScreen)
    }
}

private struct QuestionRow: View {
    let question: Question
    @Binding var responses: [String: ResponseValue]
    var stats: FieldStatsBundle?

    var body: some View {
        let line = statLine()
        switch question.type {
        case .text:        TextRow(question: question, value: textBinding)
        case .number:      NumberRow(question: question, value: numberBinding, statLine: line)
        case .boolean:     BoolRow(question: question, value: boolBinding, statLine: line)
        case .multiselect: MultiselectRow(question: question, value: stringsBinding)
        case .picker:      PickerRow(question: question, value: textBinding, statLine: line)
        case .date:        DateRow(question: question, value: textBinding)
        case .address:     AddressRow(question: question, address: addressBinding)
        }
    }

    // One discreet line comparing the population: local / país / mundo. Numbers
    // show averages, booleans the % "sí", pickers the selected option's share.
    private func statLine() -> String? {
        guard let stats else { return nil }
        let id = question.id
        func fmt(_ d: Double) -> String {
            d.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(d))" : String(format: "%.1f", d)
        }
        func pct(_ d: Double) -> String { "\(Int((d * 100).rounded()))%" }

        switch question.type {
        case .number:
            let parts = [
                stats.local?.fields[id]?.mean.map { "local \(fmt($0))" },
                stats.country.fields[id]?.mean.map { "país \(fmt($0))" },
                stats.world?.fields[id]?.mean.map { "mundo \(fmt($0))" },
            ].compactMap { $0 }
            return parts.isEmpty ? nil : "Promedio · " + parts.joined(separator: " · ")
        case .boolean:
            let parts = [
                stats.local?.fields[id]?.pctTrue.map { "local \(pct($0))" },
                stats.country.fields[id]?.pctTrue.map { "país \(pct($0))" },
                stats.world?.fields[id]?.pctTrue.map { "mundo \(pct($0))" },
            ].compactMap { $0 }
            return parts.isEmpty ? nil : "Sí · " + parts.joined(separator: " · ")
        case .picker:
            guard let sel = responses[id]?.asText, !sel.isEmpty else { return nil }
            let parts = [
                stats.local?.fields[id]?.freq?[sel].map { "local \(pct($0))" },
                stats.country.fields[id]?.freq?[sel].map { "país \(pct($0))" },
            ].compactMap { $0 }
            return parts.isEmpty ? nil : "\(sel) · " + parts.joined(separator: " · ")
        default:
            return nil
        }
    }

    // MARK: - Bindings derived from responses[id]

    private var textBinding: Binding<String> {
        Binding(
            get: { responses[question.id]?.asText ?? "" },
            set: { responses[question.id] = .text($0) }
        )
    }

    private var numberBinding: Binding<String> {
        Binding(
            get: {
                if let n = responses[question.id]?.asNumber {
                    return n.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(n))" : "\(n)"
                }
                return ""
            },
            set: { newVal in
                let trimmed = newVal.replacingOccurrences(of: ",", with: ".")
                if let n = Double(trimmed) {
                    responses[question.id] = .number(n)
                } else if trimmed.isEmpty {
                    responses[question.id] = .null
                }
            }
        )
    }

    private var boolBinding: Binding<Bool> {
        Binding(
            get: { responses[question.id]?.asBool ?? false },
            set: { responses[question.id] = .bool($0) }
        )
    }

    private var stringsBinding: Binding<[String]> {
        Binding(
            get: { responses[question.id]?.asStrings ?? [] },
            set: { responses[question.id] = .strings($0) }
        )
    }

    private var addressBinding: Binding<AddressValue> {
        Binding(
            get: { responses[question.id]?.asAddress ?? AddressValue(text: "", latitud: nil, longitud: nil) },
            set: { responses[question.id] = .address($0) }
        )
    }
}

// MARK: - One per QuestionType

private struct TextRow: View {
    let question: Question
    @Binding var value: String

    var body: some View {
        Section(question.label) {
            TextField(question.placeholder ?? question.label, text: $value)
                .textContentType(textContentType(for: question.id))
                .autocorrectionDisabled(autocorrectDisabled(for: question.id))
                .textInputAutocapitalization(autocapType(for: question.id))
        }
    }

    private func textContentType(for id: String) -> UITextContentType? {
        switch id {
        case "nombre": return .name
        case "rut":    return nil
        default:       return nil
        }
    }
    private func autocorrectDisabled(for id: String) -> Bool { id == "rut" }
    private func autocapType(for id: String) -> TextInputAutocapitalization {
        id == "rut" ? .characters : .sentences
    }
}

private struct NumberRow: View {
    let question: Question
    @Binding var value: String
    var statLine: String? = nil

    var body: some View {
        Section(question.label) {
            TextField(question.placeholder ?? "0", text: $value)
                .keyboardType(.numberPad)
            if let statLine { StatCaption(text: statLine) }
        }
    }
}

private struct BoolRow: View {
    let question: Question
    @Binding var value: Bool
    var statLine: String? = nil

    var body: some View {
        Section {
            Toggle(question.label, isOn: $value)
            if let statLine { StatCaption(text: statLine) }
        }
    }
}

private struct MultiselectRow: View {
    let question: Question
    @Binding var value: [String]

    var body: some View {
        Section {
            MultiSelectAutocomplete(
                title: question.label,
                suggestions: question.options ?? [],
                placeholder: question.placeholder ?? "Buscar o agregar",
                selection: $value
            )
        }
    }
}

private struct PickerRow: View {
    let question: Question
    @Binding var value: String
    var statLine: String? = nil

    var body: some View {
        Section(question.label) {
            Picker(question.label, selection: $value) {
                Text("Seleccionar").tag("")
                ForEach(question.options ?? [], id: \.self) { opt in
                    Text(opt).tag(opt)
                }
            }
            if let statLine { StatCaption(text: statLine) }
        }
    }
}

// Discreet population comparison shown under a field.
private struct StatCaption: View {
    let text: String
    var body: some View {
        Label(text, systemImage: "chart.bar.xaxis")
            .font(.caption2)
            .foregroundStyle(.secondary)
    }
}

private struct DateRow: View {
    let question: Question
    @Binding var value: String   // ISO-8601 string

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    var body: some View {
        Section(question.label) {
            DatePicker(
                question.label,
                selection: Binding<Date>(
                    get: { Self.iso.date(from: value) ?? Date() },
                    set: { value = Self.iso.string(from: $0) }
                ),
                displayedComponents: .date
            )
        }
    }
}

private struct AddressRow: View {
    let question: Question
    @Binding var address: AddressValue

    var body: some View {
        Section(question.label) {
            AddressPicker(
                direccion: Binding(
                    get: { address.text },
                    set: { address.text = $0 }
                ),
                latitud: Binding(
                    get: { address.latitud },
                    set: { address.latitud = $0 }
                ),
                longitud: Binding(
                    get: { address.longitud },
                    set: { address.longitud = $0 }
                )
            )
        }
    }
}
