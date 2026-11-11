const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();
const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const allowedFields = ['name', 'url', 'method', 'description'];

function validateEndpointInput(body, isUpdate = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }
  const keys = Object.keys(body);
  const unsupported = keys.find((key) => !allowedFields.includes(key));
  if (unsupported) return { error: `Field "${unsupported}" cannot be changed.` };
  if (isUpdate && keys.length === 0) return { error: 'Provide at least one field to update.' };

  const data = {};
  if (!isUpdate || Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { error: 'Name is required.' };
    data.name = body.name.trim();
  }
  if (!isUpdate || Object.hasOwn(body, 'url')) {
    if (typeof body.url !== 'string' || !body.url.trim()) return { error: 'URL is required.' };
    try {
      const url = new URL(body.url.trim());
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
      data.url = url.toString();
    } catch (_) {
      return { error: 'Enter a valid HTTP or HTTPS URL.' };
    }
  }
  if (!isUpdate || Object.hasOwn(body, 'method')) {
    if (typeof body.method !== 'string' || !allowedMethods.includes(body.method.trim().toUpperCase())) {
      return { error: 'Method must be GET, POST, PUT, PATCH, or DELETE.' };
    }
    data.method = body.method.trim().toUpperCase();
  }
  if (Object.hasOwn(body, 'description')) {
    if (body.description !== null && typeof body.description !== 'string') return { error: 'Description must be text.' };
    data.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
  }
  return { data };
}

router.get('/', async (req, res) => {
  try {
    const endpoints = await prisma.aPIEndpoint.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: endpoints });
  } catch (error) {
    console.error('Unable to list API endpoints:', error.message);
    res.status(500).json({ success: false, message: 'Unable to retrieve API endpoints.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const endpoint = await prisma.aPIEndpoint.findUnique({ where: { id: req.params.id } });
    if (!endpoint) return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    res.json({ success: true, data: endpoint });
  } catch (error) {
    console.error('Unable to retrieve API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to retrieve API endpoint.' });
  }
});

router.post('/', async (req, res) => {
  const result = validateEndpointInput(req.body);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  try {
    const endpoint = await prisma.aPIEndpoint.create({ data: result.data });
    res.status(201).json({ success: true, data: endpoint, message: 'API endpoint created.' });
  } catch (error) {
    console.error('Unable to create API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to create API endpoint.' });
  }
});

router.put('/:id', async (req, res) => {
  const result = validateEndpointInput(req.body, true);
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  try {
    const existing = await prisma.aPIEndpoint.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    const endpoint = await prisma.aPIEndpoint.update({ where: { id: req.params.id }, data: result.data });
    res.json({ success: true, data: endpoint, message: 'API endpoint updated.' });
  } catch (error) {
    console.error('Unable to update API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to update API endpoint.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.aPIEndpoint.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    // The schema's onDelete: Cascade rules remove checks, incidents, and versions.
    await prisma.aPIEndpoint.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'API endpoint and its associated records were deleted.' });
  } catch (error) {
    console.error('Unable to delete API endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Unable to delete API endpoint.' });
  }
});

module.exports = router;
