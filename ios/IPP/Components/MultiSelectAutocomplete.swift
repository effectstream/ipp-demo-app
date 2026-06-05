import SwiftUI

struct MultiSelectAutocomplete: View {
    let title: String
    let suggestions: [String]
    let placeholder: String
    @Binding var selection: [String]

    @State private var query: String = ""
    @FocusState private var fieldFocused: Bool

    private var filteredSuggestions: [String] {
        let lower = query.lowercased()
        let base = suggestions.filter { !selection.contains($0) }
        if lower.isEmpty { return base }
        return base.filter { $0.lowercased().contains(lower) }
    }

    private var canAddCustom: Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty
            && !selection.contains(where: { $0.caseInsensitiveCompare(trimmed) == .orderedSame })
            && !filteredSuggestions.contains(where: { $0.caseInsensitiveCompare(trimmed) == .orderedSame })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)

            if !selection.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(selection, id: \.self) { item in
                        Chip(text: item) { remove(item) }
                    }
                }
            }

            HStack {
                TextField(placeholder, text: $query)
                    .textFieldStyle(.roundedBorder)
                    .focused($fieldFocused)
                    .autocorrectionDisabled(true)
                    .onSubmit { addCustomIfPossible() }
                if canAddCustom {
                    Button("Agregar") { addCustomIfPossible() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
            }

            if fieldFocused && !filteredSuggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(filteredSuggestions.prefix(6), id: \.self) { suggestion in
                        Button { add(suggestion) } label: {
                            HStack {
                                Image(systemName: "plus.circle")
                                Text(suggestion)
                                Spacer()
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }
                }
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private func add(_ value: String) {
        if !selection.contains(value) { selection.append(value) }
        query = ""
    }

    private func remove(_ value: String) {
        selection.removeAll { $0 == value }
    }

    private func addCustomIfPossible() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        add(trimmed)
    }
}

private struct Chip: View {
    let text: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(text)
                .font(.callout)
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.accentColor.opacity(0.15))
        .clipShape(Capsule())
    }
}

// Lightweight flow layout so chips wrap to multiple lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            totalWidth = max(totalWidth, x)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: totalWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.minX + maxWidth {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
