export const getConfidenceLevel = (score) => {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
};
