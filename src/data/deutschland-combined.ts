/**
 * Kombiniert alle Bundesländer zu einem Deutschland-Umriss
 */

import bundeslaenderGeoJSON from './bundeslaender.geo.json';

// Kombiniere alle Bundesländer zu einem MultiPolygon
export const deutschlandGeoJSON = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { name: "Deutschland" },
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: bundeslaenderGeoJSON.features.map((feature: any) => {
          if (feature.geometry.type === 'Polygon') {
            return [feature.geometry.coordinates];
          } else if (feature.geometry.type === 'MultiPolygon') {
            return feature.geometry.coordinates;
          }
          return [];
        }).flat()
      }
    }
  ]
};
