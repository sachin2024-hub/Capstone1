export const INCIDENT_TYPE_GROUPS = [
  {
    category: 'Medical Emergency',
    options: [
      'Heart Attack / Cardiac',
      'Stroke',
      'Difficulty Breathing',
      'Unconscious',
      'Severe Bleeding',
      'Allergic Reaction',
      'Pregnancy Emergency',
      'Other Medical',
    ],
  },
  {
    category: 'Fire',
    options: [
      'House / Building Fire',
      'Wildfire / Grass Fire',
      'Electrical Fire',
      'Kitchen Fire',
      'Smoke Only',
      'Other Fire',
    ],
  },
  {
    category: 'Vehicular Accident',
    options: [
      'Motorcycle (Solo)',
      'Motorcycle vs Car',
      'Motorcycle vs Tricycle',
      'Motorcycle vs Motorcycle',
      'Car vs Car',
      'Car vs Tricycle',
      'Tricycle vs Tricycle',
      'Vehicle vs Pedestrian',
      'Other Vehicular Accident',
    ],
  },
  {
    category: 'Natural Disaster',
    options: [
      'Flood',
      'Landslide',
      'Earthquake',
      'Typhoon / Strong Wind',
      'Storm Surge',
      'Other Natural Disaster',
    ],
  },
  {
    category: 'Crime / Violence',
    options: [
      'Physical Assault',
      'Robbery / Theft',
      'Domestic Violence',
      'Stabbing / Weapon',
      'Shooting',
      'Other Crime / Violence',
    ],
  },
  {
    category: 'Drowning',
    options: [
      'Swimming Pool',
      'River / Creek',
      'Flood Water',
      'Sea / Beach',
      'Other Drowning',
    ],
  },
  {
    category: 'Fall / Injury',
    options: [
      'Fall from Height',
      'Slip and Fall',
      'Fracture / Broken Bone',
      'Head Injury',
      'Cut / Laceration',
      'Burn Injury',
      'Other Fall / Injury',
    ],
  },
  {
    category: 'Other Emergency',
    options: [
      'Power Outage Emergency',
      'Gas Leak',
      'Animal Attack',
      'Missing Person',
      'Structural Collapse',
      'Other Emergency',
    ],
  },
];

/** Old records may still store "Traffic Accident". */
export const INCIDENT_TYPE_ALIASES = {
  'Vehicular Accident': ['Traffic Accident'],
};

export const INCIDENT_SUBTYPE_ALIASES = {
  'Other Vehicular Accident': ['Other Traffic Accident'],
};

export function matchingTypeNames(category) {
  return [category, ...(INCIDENT_TYPE_ALIASES[category] || [])];
}

export function matchingSubTypeNames(sub) {
  return [sub, ...(INCIDENT_SUBTYPE_ALIASES[sub] || [])];
}

