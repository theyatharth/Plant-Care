const db = require('../configure/dbConfig');

// Get all plants (with pagination)
exports.getAllPlants = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let query, countQuery, params, countParams;

    if (search) {
      query = `
        SELECT id, scientific_name, common_name, description, created_at
        FROM plant_species
        WHERE common_name ILIKE $1 OR scientific_name ILIKE $1
        ORDER BY common_name ASC
        LIMIT $2 OFFSET $3
      `;
      countQuery = `SELECT COUNT(*) FROM plant_species WHERE common_name ILIKE $1 OR scientific_name ILIKE $1`;
      params = [`%${search}%`, limit, offset];
      countParams = [`%${search}%`];
    } else {
      query = `
        SELECT id, scientific_name, common_name, description, created_at
        FROM plant_species
        ORDER BY common_name ASC
        LIMIT $1 OFFSET $2
      `;
      countQuery = `SELECT COUNT(*) FROM plant_species`;
      params = [limit, offset];
      countParams = [];
    }

    const [plantsResult, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams)
    ]);

    const totalPlants = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalPlants / limit);

    res.json({
      plants: plantsResult.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalPlants,
        limit
      }
    });
  } catch (error) {
    console.error('Get All Plants Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch plants' });
  }
};

// Get single plant details
exports.getPlantById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM plant_species WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plant not found' });
    }

    res.json({ plant: result.rows[0] });
  } catch (error) {
    console.error('Get Plant Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch plant details' });
  }
};
