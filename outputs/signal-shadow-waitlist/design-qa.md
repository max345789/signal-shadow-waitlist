# Sign-in screen design QA

## Reference comparison

- **Desktop viewport:** 1200 × 800. The centered white frame is approximately 920 × 686 px and shifted down 50 px to match the reference's lower placement. The forest background fills the viewport, and the halftone portrait occupies the right portion of the frame.
- **Mobile viewport:** 390 × 844. The form and artwork stack vertically, remain inside the viewport width, and the frame can scroll when the viewport is shorter than the content.
- **Typography:** compact sans-serif heading and monospaced helper copy, labels, and fields follow the reference's restrained type hierarchy.
- **Color and surfaces:** monochrome forest and artwork, white card, fine light border, and black primary action match the supplied reference.
- **Artwork:** grayscale fog forest and halftone portrait assets are used as the page background and right-side panel.
- **Copy and controls:** email/password sign-in, password visibility, password reset, and account creation remain available. Google and Apple sign-in are omitted per the earlier request.

## Result

**Final result: passed.** Desktop and mobile layouts were inspected in the local browser. The only difference in local development is the expected configuration notice because local Supabase credentials are not present; production configuration is unchanged.
