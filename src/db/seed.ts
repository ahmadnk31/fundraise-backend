import 'dotenv/config';
import { db, users, campaigns, donations } from '../db/index.js';
import bcrypt from 'bcryptjs';

const seedData = {
  users: [
    {
      email: 'maria.gonzalez@email.com',
      firstName: 'Maria',
      lastName: 'Gonzalez',
      password: 'password123',
      isVerified: true
    },
    {
      email: 'john.smith@email.com',
      firstName: 'John',
      lastName: 'Smith',
      password: 'password123',
      isVerified: true
    },
    {
      email: 'sarah.johnson@email.com',
      firstName: 'Sarah',
      lastName: 'Johnson',
      password: 'password123',
      isVerified: true
    },
    {
      email: 'david.williams@email.com',
      firstName: 'David',
      lastName: 'Williams',
      password: 'password123',
      isVerified: true
    },
    {
      email: 'lisa.brown@email.com',
      firstName: 'Lisa',
      lastName: 'Brown',
      password: 'password123',
      isVerified: true
    },
    {
      email: 'michael.davis@email.com',
      firstName: 'Michael',
      lastName: 'Davis',
      password: 'password123',
      isVerified: true
    }
  ],

  campaigns: [
    {
      title: 'Help Maria Get Life-Saving Surgery',
      slug: 'help-maria-surgery',
      summary: 'Urgent heart surgery needed for 8-year-old Maria',
      story: `Maria is a bright 8-year-old girl who loves to draw and play with her younger brother. Unfortunately, she was born with a serious heart condition that requires immediate surgical intervention.

The surgery is complex and expensive, but it will give Maria the chance at a normal, healthy childhood that every child deserves. Her family has exhausted all their savings and is now reaching out to the community for help.

The medical team is ready to perform the surgery as soon as we can raise the necessary funds. Every donation, no matter how small, brings us closer to saving Maria's life.

**What the funds will cover:**
- Pre-operative medical tests and consultations
- The surgical procedure and medical equipment
- Hospital stay and recovery care
- Post-operative medications and follow-up visits

Maria's parents are incredibly grateful for any support you can provide. Your donation will literally help save a life and give a little girl the future she deserves.`,
      goalAmount: '75000.00',
      currentAmount: '45000.00',
      category: 'Medical',
      coverImage: '/placeholder.svg',
      deadline: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days from now
      isActive: true,
      isApproved: true,
      isFeatured: true
    },
    {
      title: 'Build Clean Water Wells in Rural Kenya',
      slug: 'water-wells-kenya',
      summary: 'Providing clean water access to rural communities',
      story: `Access to clean, safe drinking water is a basic human right, yet millions of people in rural Kenya still lack this essential resource. Our mission is to build sustainable water wells that will serve entire communities for decades to come.

Each well we build serves approximately 500 people and provides clean water for drinking, cooking, and basic sanitation needs. The impact goes far beyond just water access - it improves health outcomes, allows children to attend school instead of walking miles for water, and enables communities to thrive.

**Project Details:**
- Location: Rural villages in Turkana County, Kenya
- Each well serves 500+ people
- Solar-powered pumping system for sustainability
- Local training for maintenance and operation
- 20-year lifespan with proper maintenance

**Impact So Far:**
- 5 wells completed in 2024
- 2,500+ people now have clean water access
- 40% reduction in waterborne diseases
- 300+ children able to attend school regularly

Your contribution will help us continue this vital work and bring clean water to communities that need it most.`,
      goalAmount: '50000.00',
      currentAmount: '28000.00',
      category: 'Community',
      coverImage: '/placeholder.svg',
      deadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days from now
      isActive: true,
      isApproved: true,
      isFeatured: false
    },
    {
      title: 'Scholarship Fund for Underprivileged Students',
      slug: 'scholarship-fund',
      summary: 'Supporting bright students achieve their educational dreams',
      story: `Education is the key to breaking the cycle of poverty, but many brilliant students can't afford to pursue higher education. Our scholarship fund helps deserving students from low-income families access quality education and build better futures.

We support students through their entire educational journey, from application assistance to graduation support. Our scholars maintain high academic standards and give back to their communities.

**What We Provide:**
- Full or partial tuition coverage
- Books and educational materials
- Living expenses for students away from home
- Mentorship and career guidance
- Internship and job placement assistance

**Success Stories:**
- 150+ students supported since 2020
- 89% graduation rate among our scholars
- 95% employment rate within 6 months of graduation
- Many scholars now mentor new students

**This Year's Goals:**
- Support 25 new students
- Expand to include vocational training programs
- Launch alumni mentorship network
- Partner with local employers for job placement

Every dollar donated directly supports a student's education. Help us invest in the next generation of leaders and change-makers.`,
      goalAmount: '25000.00',
      currentAmount: '15000.00',
      category: 'Education',
      coverImage: '/placeholder.svg',
      deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000), // 18 days from now
      isActive: true,
      isApproved: true,
      isFeatured: false
    },
    {
      title: 'Emergency Relief for Flood Victims',
      slug: 'flood-relief',
      summary: 'Immediate relief for families affected by recent flooding',
      story: `Devastating floods have affected thousands of families in our region, leaving many without homes, clean water, or basic necessities. The immediate need for emergency relief is critical.

Our emergency response team is on the ground providing immediate assistance, but we need your help to continue this vital work.

**Immediate Needs:**
- Emergency food packages for 500 families
- Clean drinking water and purification tablets
- Temporary shelter materials and blankets
- Medical supplies and first aid kits
- Clothing and personal hygiene items

**Response Efforts:**
- Mobile medical clinics in affected areas
- Food distribution centers
- Temporary shelter setup
- Clean water delivery
- Coordination with local authorities

**Long-term Recovery:**
- Home reconstruction assistance
- School and infrastructure rebuilding
- Livelihood restoration programs
- Community resilience building

Time is critical. Every hour counts in emergency relief efforts. Your donation will provide immediate life-saving assistance to families who have lost everything.`,
      goalAmount: '80000.00',
      currentAmount: '67000.00',
      category: 'Emergency',
      coverImage: '/placeholder.svg',
      deadline: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 days from now
      isActive: true,
      isApproved: true,
      isFeatured: true
    },
    {
      title: 'Save the Local Animal Shelter',
      slug: 'animal-shelter',
      summary: 'Help keep our beloved animal shelter operational',
      story: `Our local animal shelter has been a safe haven for abandoned and abused animals for over 15 years. Due to rising costs and reduced funding, we're facing closure unless we can raise emergency funds.

The shelter currently houses 75 animals, including dogs, cats, and small animals. All are looking for loving homes while receiving proper care, medical treatment, and rehabilitation.

**What We Do:**
- Rescue and rehabilitate abandoned animals
- Provide medical care and vaccinations
- Spay/neuter programs to control pet population
- Adoption services to find forever homes
- Community education about responsible pet ownership

**Financial Challenges:**
- Rising veterinary costs
- Increased utility and facility maintenance
- More animals needing expensive medical treatment
- Reduced municipal funding

**How Funds Will Be Used:**
- $30,000 - Six months of operational costs
- $15,000 - Emergency medical fund
- $10,000 - Facility repairs and improvements
- $5,000 - Spay/neuter program supplies

**Our Impact:**
- 200+ animals adopted in 2024
- 95% adoption success rate
- 300+ spay/neuter procedures performed
- Zero healthy animals euthanized

Without community support, these innocent animals will have nowhere to go. Please help us continue saving lives.`,
      goalAmount: '60000.00',
      currentAmount: '32000.00',
      category: 'Animals',
      coverImage: '/placeholder.svg',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      isActive: true,
      isApproved: true,
      isFeatured: false
    },
    {
      title: 'Youth Soccer Team Equipment',
      slug: 'youth-soccer',
      summary: 'New equipment and uniforms for local youth soccer team',
      story: `Our community youth soccer team has been playing with worn-out equipment for years. These dedicated young athletes deserve proper gear to safely enjoy the sport they love while learning valuable life skills.

The team consists of 25 players aged 8-16 from diverse backgrounds. Many families struggle financially, making it difficult to afford proper soccer equipment. Your support will ensure every child can participate regardless of their family's economic situation.

**What We Need:**
- 25 complete uniforms (home and away)
- Soccer balls for practice and games
- Goal posts and nets
- Cones and training equipment
- First aid supplies and water bottles
- Team bag and equipment storage

**About Our Team:**
- Established in 2019
- 100% volunteer coaching staff
- Focus on skill development and teamwork
- Emphasis on good sportsmanship and character
- Regular community service projects

**Team Achievements:**
- Regional champions 2023
- 3 players selected for district teams
- 100% high school graduation rate among alumni
- Strong academic performance requirements

**Beyond Soccer:**
- Homework assistance program
- Life skills workshops
- College preparation support
- Leadership development opportunities

These kids work hard both on the field and in the classroom. Help us give them the equipment they need to continue growing as athletes and young leaders in our community.`,
      goalAmount: '15000.00',
      currentAmount: '8500.00',
      category: 'Sports',
      coverImage: '/placeholder.svg',
      deadline: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000), // 22 days from now
      isActive: true,
      isApproved: true,
      isFeatured: false
    }
  ]
};

function generateDonationMessage(): string {
  const messages = [
    "Happy to help with this important cause!",
    "Wishing you all the best with this campaign.",
    "Thank you for making a difference in the community.",
    "Hope this helps reach your goal soon!",
    "Supporting this wonderful initiative.",
    "Keep up the great work!",
    "Praying for success with this campaign.",
    "Every little bit helps - proud to contribute!",
    "This cause is close to my heart.",
    "Best wishes for a successful outcome.",
    "Honored to be part of this effort.",
    "May this campaign exceed its goals!",
    "Supporting because this matters.",
    "Hope this contribution makes a difference.",
    "Believing in this cause and your mission.",
    "Together we can make it happen!",
    "Glad to help in any way I can.",
    "This is such an important cause.",
    "Wishing you strength and success.",
    "Proud to support this initiative."
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

async function seed() {
  try {
    console.log('Starting database seeding...');

    // Clear existing data in reverse order of dependencies
    console.log('Clearing existing data...');
    await db.delete(donations);
    await db.delete(campaigns);
    await db.delete(users);

    // Insert users
    console.log('Inserting users...');
    const hashedUsers = await Promise.all(
      seedData.users.map(async (user, index) => ({
        ...user,
        password: await bcrypt.hash(user.password, 10),
        createdAt: new Date(Date.now() - ((seedData.users.length - index) * 24 * 60 * 60 * 1000)),
        updatedAt: new Date()
      }))
    );

    const insertedUsers = await db.insert(users).values(hashedUsers).returning();
    console.log(`Inserted ${insertedUsers.length} users`);

    // Insert campaigns with real user IDs
    console.log('Inserting campaigns...');
    const campaignsWithOwners = seedData.campaigns.map((campaign, index) => ({
      ...campaign,
      userId: insertedUsers[index % insertedUsers.length].id,
      createdAt: new Date(Date.now() - ((seedData.campaigns.length - index) * 12 * 60 * 60 * 1000)),
      updatedAt: new Date()
    }));

    const insertedCampaigns = await db.insert(campaigns).values(campaignsWithOwners).returning();
    console.log(`Inserted ${insertedCampaigns.length} campaigns`);

    // Generate realistic donations
    console.log('Generating donations...');
    const donationData = [];

    for (const campaign of insertedCampaigns) {
      const totalRaised = parseFloat(campaign.currentAmount);
      const donationCount = Math.floor(Math.random() * 25) + 10; // 10-35 donations per campaign
      
      let remainingAmount = totalRaised;
      
      for (let i = 0; i < donationCount && remainingAmount > 0; i++) {
        const maxDonation = Math.min(5000, totalRaised / 5);
        const minDonation = 10;
        
        const donationAmount = Math.min(
          remainingAmount,
          Math.floor(Math.random() * (maxDonation - minDonation)) + minDonation
        );
        
        donationData.push({
          campaignId: campaign.id,
          donorId: insertedUsers[Math.floor(Math.random() * insertedUsers.length)].id,
          amount: donationAmount.toString(),
          paymentMethod: 'credit_card',
          currency: 'USD',
          isAnonymous: Math.random() < 0.3, // 30% anonymous
          message: Math.random() < 0.6 ? generateDonationMessage() : null,
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          updatedAt: new Date()
        });
        
        remainingAmount -= donationAmount;
      }
    }

    const insertedDonations = await db.insert(donations).values(donationData).returning();
    console.log(`Inserted ${insertedDonations.length} donations`);

    console.log('Database seeding completed successfully!');
    console.log(`Summary:
    - Users: ${insertedUsers.length}
    - Campaigns: ${insertedCampaigns.length}
    - Donations: ${insertedDonations.length}`);

  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

seed()
  .then(() => {
    console.log('Seeding completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
