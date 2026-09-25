# Account, shop and branch access

One login can shop across the marketplace and hold a separate role in each business. Shopping does not require a staff membership and buying from a shop never grants business access. Account carts, addresses and order history are private to the signed-in customer; guest orders use private tracking tokens.

Owners control their own shop details, publication, catalog and team. Other owners have no authority over that shop unless explicitly granted a membership there; that membership's role governs their access. Owners can add, edit and delete unused products. Products with stock or transaction references must be archived to preserve records. Unpublishing hides a shop without deleting its records. Currency remains fixed for the ledger.

In the web dashboard's Team screen, owners can add an existing username as a cashier or manager at one of their own branches, after the team member registers their own account. Adding an existing account never changes its password or email. Owners can update the role, branch and active status of non-owner memberships. Deactivation removes access only to that business; the account can still shop and use other memberships. Owner membership changes remain a separate ownership-transfer workflow.

Private API operations require an active user and active membership with a supported role and a branch belonging to that business. Sales, receipts, orders, stock movements and registers are scoped to the assigned branch. Manager reports are branch-scoped; owner reports cover their business. Catalog and customer contact records are business-wide; customer purchase history is branch-scoped. Foreign branch references are rejected when assigning staff or selecting online fulfilment.

Every published shop with a branch appears in the marketplace, including shops with empty or unpublished catalogs. Draft shops and private products stay hidden. Product/category search only matches visible products. Customers, owners and staff can place orders across published shops, subject to product availability, stock and delivery rules.

Validation: `apps.common.test_access_boundaries` covers cross-owner writes, own-shop product CRUD, existing-account staff assignment, membership deactivation, branch isolation, private customer history and multishop checkout.
