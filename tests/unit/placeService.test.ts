import { describe, expect, it } from "vitest";
import { safeWebsite, toPlaceDetails } from "../../src/services/placeService";

const found = {
  osm_type: "node",
  osm_id: 4447135317,
  lat: "12.945",
  lon: "77.5714",
  name: "Vidyarthi Bhavan",
  category: "amenity",
  type: "restaurant",
  address: { house_number: "32", road: "Gandhi Bazaar Main Road", suburb: "Basavanagudi", city: "Bengaluru", country_code: "in" },
  extratags: {
    opening_hours: "Mo-Th 06:30-11:30",
    phone: "+91 80 2667 7588; +91 99999 00000",
    website: "vidyarthibhavan.in",
    cuisine: "regional;south_indian",
    "diet:vegetarian": "only",
    "payment:upi": "yes",
    "payment:cash": "yes",
    smoking: "no",
    wheelchair: "limited",
    takeaway: "yes",
    "contact:instagram": "https://instagram.com/vb",
    wikipedia: "en:Vidyarthi Bhavan",
  },
};

describe("toPlaceDetails", () => {
  const d = toPlaceDetails(found, { matched: true, lat: 0, lng: 0 });

  it("keeps identity and position from the matched place", () => {
    expect(d.id).toBe("node/4447135317");
    expect(d.osmUrl).toBe("https://www.openstreetmap.org/node/4447135317");
    expect([d.lat, d.lng]).toEqual([12.945, 77.5714]);
  });

  it("reads the useful details", () => {
    expect(d.category).toBe("Restaurant");
    expect(d.cuisine).toBe("Regional, South indian");
    expect(d.phones).toEqual(["+91 80 2667 7588", "+91 99999 00000"]);
    expect(d.website).toBe("https://vidyarthibhavan.in/");
    expect(d.address).toBe("32 Gandhi Bazaar Main Road, Basavanagudi, Bengaluru");
    expect(d.features).toContain("Takeaway");
    expect(d.social).toEqual([{ label: "Instagram", href: "https://instagram.com/vb" }]);
    expect(d.info).toEqual(
      expect.arrayContaining([
        { label: "Wheelchair", value: "Partly accessible" },
        { label: "Payment", value: "Cash, UPI" },
        { label: "Food", value: "Vegetarian only" },
        { label: "Smoking", value: "No smoking" },
      ]),
    );
    expect(d.expectsHours).toBe(true);
  });

  it("doesn't expect hours for monuments", () => {
    const m = toPlaceDetails({ ...found, category: "historic", type: "monument", extratags: {} }, { matched: true, lat: 0, lng: 0 });
    expect(m.expectsHours).toBe(false);
  });

  it("an unmatched tap is a dropped pin with no borrowed details", () => {
    const pin = toPlaceDetails(found, { matched: false, lat: 1.5, lng: 2.5 });
    expect(pin.name).toBeNull();
    expect(pin.phones).toEqual([]);
    expect(pin.id).toBe("pin/1.500000,2.500000");
  });
});

describe("safeWebsite", () => {
  it("only allows http(s) links", () => {
    expect(safeWebsite("javascript:alert(1)")).toBeNull();
    expect(safeWebsite("example.com")).toBe("https://example.com/");
    expect(safeWebsite("http://example.com/x")).toBe("http://example.com/x");
    expect(safeWebsite(null)).toBeNull();
  });
});
