const applyPlantGuardrails = (ai) => {
  ai.confidence = Number(ai.confidence) || 0;

  ai.plant_name = ai.plant_name?.trim() || 'Unknown';
  ai.scientific_name = ai.scientific_name?.trim() || 'Unknown';

  // Rule 1: Confidence gate
  if (ai.confidence < 0.75) {
    return {
      ...ai,
      plant_name: 'Unknown',
      scientific_name: 'Unknown',
      identification_status: 'Uncertain'
    };
  }

  // Rule 2: Invalid scientific name
  if (!ai.scientific_name.includes(' ') || ai.scientific_name.length < 6) {
    return {
      ...ai,
      plant_name: 'Unknown',
      scientific_name: 'Unknown',
      identification_status: 'Uncertain'
    };
  }

  // Rule 3: Image quality
  if (ai.image_quality === 'Poor') {
    return {
      ...ai,
      plant_name: 'Unknown',
      scientific_name: 'Unknown',
      identification_status: 'Uncertain'
    };
  }

  return {
    ...ai,
    identification_status: 'Confirmed'
  };
}

module.exports = { applyPlantGuardrails };
