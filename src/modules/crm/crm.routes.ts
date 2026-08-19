import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// GET /api/v1/crm/customers
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { search, groupId, page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const whereClause: any = {
      workspaceId,
    };

    if (search) {
      const searchStr = search as string;
      whereClause.OR = [
        { companyName: { contains: searchStr, mode: 'insensitive' } },
        { phone: { contains: searchStr, mode: 'insensitive' } },
        { website: { contains: searchStr, mode: 'insensitive' } },
        { address: { contains: searchStr, mode: 'insensitive' } },
        { country: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    if (groupId && groupId !== 'all') {
      whereClause.groups = {
        some: {
          groupId: groupId as string,
        },
      };
    }

    // Fetch customers
    const [customers, total] = await Promise.all([
      prisma.crmCustomer.findMany({
        where: whereClause,
        include: {
          contacts: true,
          groups: {
            include: {
              group: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.crmCustomer.count({ where: whereClause }),
    ]);

    // Calculate overall stats
    const [totalCount, activeCount, inactiveCount, totalContacts] = await Promise.all([
      prisma.crmCustomer.count({ where: { workspaceId } }),
      prisma.crmCustomer.count({ where: { workspaceId, active: true } }),
      prisma.crmCustomer.count({ where: { workspaceId, active: false } }),
      prisma.crmCustomerContact.count({
        where: { customer: { workspaceId } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
        stats: {
          totalCustomers: totalCount,
          activeCustomers: activeCount,
          inactiveCustomers: inactiveCount,
          activeContacts: totalContacts, // Simply mapping total contacts count as active contacts
          inactiveContacts: 0,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/crm/customers
router.post('/customers', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const {
      companyName,
      vatNumber,
      phone,
      website,
      currency,
      language,
      address,
      city,
      state,
      zipCode,
      country,
      shippingStreet,
      shippingCity,
      shippingState,
      shippingZipCode,
      shippingCountry,
      groupIds = [],
      primaryContact,
    } = req.body;

    if (!companyName || !companyName.trim()) {
      res.status(450).json({ success: false, error: 'Company Name is required' });
      return;
    }

    // Create Customer record and handle relation inserts
    const customer = await prisma.crmCustomer.create({
      data: {
        workspaceId,
        companyName: companyName.trim(),
        vatNumber: vatNumber || null,
        phone: phone || null,
        website: website || null,
        currency: currency || 'USD',
        language: language || 'English',
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        country: country || null,
        shippingStreet: shippingStreet || null,
        shippingCity: shippingCity || null,
        shippingState: shippingState || null,
        shippingZipCode: shippingZipCode || null,
        shippingCountry: shippingCountry || null,
        groups: {
          create: groupIds.map((gId: string) => ({
            groupId: gId,
          })),
        },
      },
    });

    // Create primary contact if details are provided
    if (primaryContact && primaryContact.firstName && primaryContact.email) {
      await prisma.crmCustomerContact.create({
        data: {
          customerId: customer.id,
          firstName: primaryContact.firstName.trim(),
          lastName: primaryContact.lastName?.trim() || '',
          email: primaryContact.email.trim(),
          phone: primaryContact.phone || null,
        },
      });
    }

    res.status(201).json({ success: true, data: customer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/crm/customers/:id
router.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;
    const {
      companyName,
      vatNumber,
      phone,
      website,
      currency,
      language,
      address,
      city,
      state,
      zipCode,
      country,
      shippingStreet,
      shippingCity,
      shippingState,
      shippingZipCode,
      shippingCountry,
      groupIds = [],
    } = req.body;

    const existing = await prisma.crmCustomer.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      res.status(444).json({ success: false, error: 'Customer not found' });
      return;
    }

    // Update Customer details
    const customer = await prisma.crmCustomer.update({
      where: { id },
      data: {
        companyName: companyName ? companyName.trim() : existing.companyName,
        vatNumber: vatNumber !== undefined ? vatNumber : existing.vatNumber,
        phone: phone !== undefined ? phone : existing.phone,
        website: website !== undefined ? website : existing.website,
        currency: currency !== undefined ? currency : existing.currency,
        language: language !== undefined ? language : existing.language,
        address: address !== undefined ? address : existing.address,
        city: city !== undefined ? city : existing.city,
        state: state !== undefined ? state : existing.state,
        zipCode: zipCode !== undefined ? zipCode : existing.zipCode,
        country: country !== undefined ? country : existing.country,
        shippingStreet: shippingStreet !== undefined ? shippingStreet : existing.shippingStreet,
        shippingCity: shippingCity !== undefined ? shippingCity : existing.shippingCity,
        shippingState: shippingState !== undefined ? shippingState : existing.shippingState,
        shippingZipCode: shippingZipCode !== undefined ? shippingZipCode : existing.shippingZipCode,
        shippingCountry: shippingCountry !== undefined ? shippingCountry : existing.shippingCountry,
      },
    });

    // Update group relations
    if (groupIds) {
      await prisma.crmCustomerGroupRelation.deleteMany({
        where: { customerId: id },
      });
      if (groupIds.length > 0) {
        await prisma.crmCustomerGroupRelation.createMany({
          data: groupIds.map((gId: string) => ({
            customerId: id,
            groupId: gId,
          })),
        });
      }
    }

    res.json({ success: true, data: customer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/crm/customers/:id
router.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;

    const customer = await prisma.crmCustomer.findFirst({
      where: { id, workspaceId },
    });

    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }

    await prisma.crmCustomer.delete({ where: { id } });
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/crm/customers/toggle/:id
router.post('/customers/toggle/:id', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;

    const customer = await prisma.crmCustomer.findFirst({
      where: { id, workspaceId },
    });

    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }

    const updated = await prisma.crmCustomer.update({
      where: { id },
      data: {
        active: !customer.active,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/crm/groups
router.get('/groups', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;

    const groups = await prisma.crmCustomerGroup.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: groups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/crm/groups
router.post('/groups', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { name } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Group Name is required' });
      return;
    }

    const group = await prisma.crmCustomerGroup.create({
      data: {
        workspaceId,
        name: name.trim(),
      },
    });

    res.status(201).json({ success: true, data: group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/crm/customers/import
router.post('/customers/import', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { customers = [] } = req.body;

    if (!Array.isArray(customers) || customers.length === 0) {
      res.status(400).json({ success: false, error: 'No customers list provided for import' });
      return;
    }

    let importedCount = 0;

    for (const item of customers) {
      const companyName = item.companyName || item.Company;
      if (!companyName) continue;

      const customer = await prisma.crmCustomer.create({
        data: {
          workspaceId,
          companyName: companyName.trim(),
          vatNumber: item.vatNumber || item.VAT || null,
          phone: item.phone || item.Phone || null,
          website: item.website || item.Website || null,
          currency: item.currency || item.Currency || 'USD',
          language: item.language || item.Language || 'English',
          address: item.address || item.Address || null,
          city: item.city || item.City || null,
          state: item.state || item.State || null,
          zipCode: item.zipCode || item.ZipCode || item.Zip || null,
          country: item.country || item.Country || null,
        },
      });

      // Insert primary contact if listed in the CSV row
      const primaryEmail = item.primaryEmail || item.Email || item['Primary Email'];
      const primaryName = item.primaryContact || item.Contact || item['Primary Contact'];
      
      if (primaryEmail && primaryName) {
        const nameParts = primaryName.trim().split(' ');
        const firstName = nameParts[0] || 'Imported';
        const lastName = nameParts.slice(1).join(' ') || 'Contact';

        await prisma.crmCustomerContact.create({
          data: {
            customerId: customer.id,
            firstName,
            lastName,
            email: primaryEmail.trim(),
            phone: item.ContactPhone || item.phone || null,
          },
        });
      }

      importedCount++;
    }

    res.json({ success: true, count: importedCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/crm/customers/sync-ecommerce
router.post('/customers/sync-ecommerce', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { platform } = req.body;

    const mockSyncData: Record<string, any[]> = {
      shopify: [
        { Company: 'Shopify Store - Karim Fashion', Contact: 'Karim Rahman', Email: 'karim@shopify-retail.com', Phone: '+8801700001111', City: 'Dhaka', Country: 'Bangladesh' },
        { Company: 'Global Wholesale Distributors', Contact: 'Sarah Connor', Email: 'sarah@globaldist.com', Phone: '+15005550199', City: 'New York', Country: 'USA' },
      ],
      woocommerce: [
        { Company: 'WooCommerce - Shofik Bhai Wholesales', Contact: 'Shofik Islam', Email: 'shofik@wholesale-dhaka.com', Phone: '+8801999998888', City: 'Chittagong', Country: 'Bangladesh' },
        { Company: 'Dacca Boutique Mall', Contact: 'Jahanara Begum', Email: 'jahanara@daccaboutique.com', Phone: '+8801811112222', City: 'Dhaka', Country: 'Bangladesh' },
      ],
    };

    const targetPlatform = platform?.toLowerCase() || 'shopify';
    const items = mockSyncData[targetPlatform] || mockSyncData.shopify;

    let syncedCount = 0;

    for (const item of items) {
      // Check if customer already exists in workspace
      const exists = await prisma.crmCustomer.findFirst({
        where: { workspaceId, companyName: item.Company },
      });

      if (exists) continue;

      const customer = await prisma.crmCustomer.create({
        data: {
          workspaceId,
          companyName: item.Company,
          phone: item.Phone,
          currency: 'BDT',
          city: item.City,
          country: item.Country,
        },
      });

      const nameParts = item.Contact.split(' ');
      await prisma.crmCustomerContact.create({
        data: {
          customerId: customer.id,
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(' ') || 'Retailer',
          email: item.Email,
          phone: item.Phone,
        },
      });

      syncedCount++;
    }

    res.json({ success: true, count: syncedCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
