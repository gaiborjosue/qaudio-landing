# Q Audio

A monochrome hi-fi storefront prototype for Q Audio in Cambridge, Massachusetts.

The admin product editor groups Name, Address, and Availability on one row, with pricing below. These fields stack on smaller screens.

The discount icon beside Price toggles the sale fields. Sale dates appear after a sale price is entered; existing sales open expanded. Turning the toggle off clears the sale for the next Save.

Category and brand menus scroll within a 288px maximum height. Metadata product counts link to the Products tab with that category or brand selected; filters are stored in the URL, work on reload, and switching tabs preserves unsaved edits.

Sale dates use the existing shadcn range calendar in a popover with hour/minute selectors, in America/New_York store time. An empty start means Now; an end is required. The date range stays hidden until a sale price is entered.
