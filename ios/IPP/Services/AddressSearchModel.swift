import Foundation
import MapKit
import CoreLocation

// Wraps MKLocalSearchCompleter as an ObservableObject so SwiftUI views can
// observe typeahead suggestions. Biased toward Chile by setting the
// completer's region - results elsewhere still appear, just lower in rank.
@MainActor
final class AddressSearchModel: NSObject, ObservableObject, MKLocalSearchCompleterDelegate {
    @Published var queryFragment: String = ""
    @Published var suggestions: [MKLocalSearchCompletion] = []
    @Published var isSearching: Bool = false

    private let completer: MKLocalSearchCompleter

    override init() {
        completer = MKLocalSearchCompleter()
        super.init()
        completer.delegate = self
        completer.resultTypes = .address
        // Center the bias roughly over central Chile; wide span so the whole
        // country and bordering areas still rank reasonably.
        completer.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: -33.45, longitude: -70.66),
            span: MKCoordinateSpan(latitudeDelta: 15.0, longitudeDelta: 15.0)
        )
    }

    func updateQuery(_ s: String) {
        queryFragment = s
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            suggestions = []
            isSearching = false
            return
        }
        isSearching = true
        completer.queryFragment = trimmed
    }

    func clearSuggestions() {
        suggestions = []
    }

    // Resolve a typeahead pick to a full address + coordinate.
    func resolve(_ suggestion: MKLocalSearchCompletion) async throws -> ResolvedAddress {
        let request = MKLocalSearch.Request(completion: suggestion)
        let search = MKLocalSearch(request: request)
        let response = try await search.start()
        guard
            let item = response.mapItems.first,
            let coord = item.placemark.location?.coordinate
        else {
            throw AddressError.notFound
        }
        return ResolvedAddress(
            display: Self.formatPlacemark(item.placemark, fallback: "\(suggestion.title) \(suggestion.subtitle)"),
            coordinate: coord
        )
    }

    // Forward-geocode a free-text address (used when no typeahead pick exists
    // - e.g. opening an existing patient whose record was saved before this
    // picker existed).
    static func geocode(_ text: String) async throws -> ResolvedAddress {
        let geo = CLGeocoder()
        let placemarks = try await geo.geocodeAddressString(text)
        guard let p = placemarks.first, let loc = p.location else {
            throw AddressError.notFound
        }
        return ResolvedAddress(
            display: formatPlacemark(p, fallback: text),
            coordinate: loc.coordinate
        )
    }

    // Reverse-geocode (e.g. after the user repositions the pin on the map).
    static func reverseGeocode(_ coord: CLLocationCoordinate2D) async throws -> ResolvedAddress {
        let geo = CLGeocoder()
        let placemarks = try await geo.reverseGeocodeLocation(
            CLLocation(latitude: coord.latitude, longitude: coord.longitude)
        )
        guard let p = placemarks.first else { throw AddressError.notFound }
        return ResolvedAddress(
            display: formatPlacemark(p, fallback: "\(coord.latitude), \(coord.longitude)"),
            coordinate: coord
        )
    }

    // MARK: - MKLocalSearchCompleterDelegate

    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        let results = completer.results
        Task { @MainActor in
            self.suggestions = results
            self.isSearching = false
        }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        Task { @MainActor in
            self.suggestions = []
            self.isSearching = false
        }
    }

    private static func formatPlacemark(_ p: CLPlacemark, fallback: String) -> String {
        let parts: [String?] = [
            [p.subThoroughfare, p.thoroughfare].compactMap { $0 }.joined(separator: " ").nilIfEmpty,
            p.locality,
            p.administrativeArea,
            p.country,
        ]
        let joined = parts.compactMap { $0 }.joined(separator: ", ")
        return joined.isEmpty ? fallback : joined
    }
}

struct ResolvedAddress {
    let display: String
    let coordinate: CLLocationCoordinate2D
}

enum AddressError: Error, LocalizedError {
    case notFound
    var errorDescription: String? { "No se encontró la dirección." }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
