export const normalizePlantNetResult = (data) => {
  if (!data?.results?.length) {
    return {
      confidence: 0,
      name: 'Unknown plant',
      alternatives: []
    };
  }

  const main = data.results[0];

  return {
    confidence: main.score,
    name: main.species.scientificNameWithoutAuthor,
    commonNames: main.species.commonNames || [],
    alternatives: data.results.slice(1, 4).map(r => ({
      name: r.species.scientificNameWithoutAuthor,
      score: r.score
    }))
  };
};
