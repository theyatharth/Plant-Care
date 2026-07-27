const db = require('../configure/dbConfig');

// ─── Helpers ────────────────────────────────────────────────────────────────

// Admin key guard — checks x-admin-key header against env variable
const isAdmin = (req) =>
  req.headers['x-admin-key'] === process.env.ADMIN_SECRET_KEY;

// ─── GET /api/app/version ────────────────────────────────────────────────────
// Public endpoint — called by the Flutter app on startup
// Returns the current version config so the app can decide whether to update
exports.getVersion = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT latest_version, min_version, force_update,
              ios_url, android_url, release_notes, updated_at
       FROM app_version_config
       WHERE id = 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Version config not found. Please run the migration.' });
    }

    const config = result.rows[0];

    res.json({
      latestVersion: config.latest_version,
      minVersion:    config.min_version,
      forceUpdate:   config.force_update,
      updateUrl: {
        ios:     config.ios_url,
        android: config.android_url
      },
      releaseNotes: config.release_notes,
      updatedAt:    config.updated_at
    });
  } catch (error) {
    console.error('❌ [AppVersion] getVersion error:', error.message);
    res.status(500).json({ error: 'Failed to fetch version config.' });
  }
};

// ─── PATCH /api/app/version ──────────────────────────────────────────────────
// Protected by x-admin-key header — call this from Postman when you release
// a new version. Only the fields you send will be updated.
//
// Example body: { "latestVersion": "1.1.0", "releaseNotes": "Bug fixes" }
exports.updateVersion = async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid x-admin-key header.' });
  }

  const { latestVersion, minVersion, forceUpdate, iosUrl, androidUrl, releaseNotes } = req.body;

  // Build dynamic SET clause — only update what was sent
  const fields  = [];
  const values  = [];
  let   idx     = 1;

  if (latestVersion !== undefined) { fields.push(`latest_version = $${idx++}`);  values.push(latestVersion); }
  if (minVersion    !== undefined) { fields.push(`min_version = $${idx++}`);     values.push(minVersion);    }
  if (forceUpdate   !== undefined) { fields.push(`force_update = $${idx++}`);    values.push(forceUpdate);   }
  if (iosUrl        !== undefined) { fields.push(`ios_url = $${idx++}`);         values.push(iosUrl);        }
  if (androidUrl    !== undefined) { fields.push(`android_url = $${idx++}`);     values.push(androidUrl);    }
  if (releaseNotes  !== undefined) { fields.push(`release_notes = $${idx++}`);   values.push(releaseNotes);  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  // Always stamp the update time
  fields.push(`updated_at = NOW()`);

  try {
    const result = await db.query(
      `UPDATE app_version_config
       SET ${fields.join(', ')}
       WHERE id = 1
       RETURNING latest_version, min_version, force_update, ios_url, android_url, release_notes, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Version config row not found. Please run the migration.' });
    }

    const updated = result.rows[0];
    console.log(`✅ [AppVersion] Updated to v${updated.latest_version} (min: ${updated.min_version}, force: ${updated.force_update})`);

    res.json({
      message: 'Version config updated successfully.',
      latestVersion: updated.latest_version,
      minVersion:    updated.min_version,
      forceUpdate:   updated.force_update,
      updateUrl: {
        ios:     updated.ios_url,
        android: updated.android_url
      },
      releaseNotes: updated.release_notes,
      updatedAt:    updated.updated_at
    });
  } catch (error) {
    console.error('❌ [AppVersion] updateVersion error:', error.message);
    res.status(500).json({ error: 'Failed to update version config.' });
  }
};
